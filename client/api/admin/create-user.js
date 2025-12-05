const { supabaseAdmin } = require('../../supabaseAdmin');

module.exports = async (req, res) => {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const token = req.headers.authorization?.split('Bearer ')[1];
    if (!token) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        // 1. Verify Requestor (must be super_admin or admin)
        const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
        if (authError || !user) throw new Error('Invalid token');

        // Check role in public.users or metadata
        const { data: requestorData } = await supabaseAdmin
            .from('users')
            .select('role')
            .eq('id', user.id)
            .single();

        if (!requestorData || !['admin', 'super_admin'].includes(requestorData.role)) {
            return res.status(403).json({ error: 'Forbidden' });
        }

        // 2. Create User
        const { email, password, name, role, academyId, additionalData } = req.body;

        if (!email || !password || !name) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        // Create in Auth
        const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
            user_metadata: { name, role, academy_id: academyId }
        });

        if (createError) throw createError;

        // 3. Create/Update in public.users (if trigger doesn't handle everything, but let's be safe and update)
        // Our trigger handles insert, but maybe we want to ensure role/academyId are set correctly + additional info
        const userId = newUser.user.id;

        const updates = {
            id: userId,
            email,
            name,
            role: role || 'student',
            academy_id: academyId,
            created_at: new Date().toISOString(),
            ...additionalData // e.g. student specific fields
        };

        const { error: dbError } = await supabaseAdmin
            .from('users')
            .upsert(updates);

        if (dbError) throw dbError;

        // 4. Update stats (activeStudents)
        if (role === 'student' && academyId) {
            // We can use a stored procedure or just manual update
            // Need to be careful with concurrency but fine for now
            await supabaseAdmin.rpc('increment_active_students', { academy_id_param: academyId });
            // Or if RPC doesn't exist:
            /* 
            const { data: academy } = await supabaseAdmin.from('academies').select('active_students').eq('id', academyId).single();
            if (academy) {
                await supabaseAdmin.from('academies').update({ active_students: (academy.active_students || 0) + 1 }).eq('id', academyId);
            } 
            */
        }

        res.status(200).json({ user: newUser.user });

    } catch (error) {
        console.error('Create user error:', error);
        res.status(500).json({ error: error.message });
    }
};
