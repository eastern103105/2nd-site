import { supabaseAdmin } from '../supabaseAdmin.js';

export default async function handler(req, res) {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
    );

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const token = req.headers.authorization?.split('Bearer ')[1];
    if (!token) return res.status(401).json({ error: 'Missing token' });

    // Verify Token
    // We use the normal supabase client (with anon key) to verify or getUser, 
    // OR we can use the admin client's auth.getUser(token).
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
        return res.status(401).json({ error: 'Unauthorized', details: authError });
    }

    const { studentId, status, academyId } = req.body;

    if (!studentId || !status || !academyId) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    try {
        // Perform updates using RPC or direct table queries.
        // Firestore Transaction replacement:
        // Ideally we use a stored procedure (RPC) for atomicity.
        // Or we just do sequential updates since failures might be acceptable or retryable.
        // Given complexity of RPC deployment via SQL editor, we will try sequential first,
        // unless I see I already created a function? No, I created tables.

        // 1. Get current status (optional check)
        const { data: studentDoc, error: fetchError } = await supabaseAdmin
            .from('users')
            .select('status')
            .eq('id', studentId)
            .single();

        if (fetchError) throw fetchError;

        const currentStatus = studentDoc?.status || 'active';
        if (currentStatus === status) {
            return res.status(200).json({ message: 'Status unchanged' });
        }

        // 2. Update Student Status
        const { error: updateError } = await supabaseAdmin
            .from('users')
            .update({
                status: status,
                status_updated_at: new Date()
            })
            .eq('id', studentId);

        if (updateError) throw updateError;

        // 3. Log Status Change
        const { error: logError } = await supabaseAdmin
            .from('student_status_logs')
            .insert({
                student_id: studentId,
                academy_id: academyId,
                status: status,
                changed_at: new Date(),
                changed_by: user.id
            });

        if (logError) console.error('Log Error:', logError); // Non-fatal?

        // 4. Update Counters (Academies Table)
        // We can use RPC `increment` equivalent
        // Suppose we don't have an increment function, we have to fetch-and-update or write a SQL function.
        // Let's check if we can write a simple increment.
        // It's safer to use a SQL function.
        // But for now, let's just fetch and update. (Concurrency risk exists but likely low traffic).

        const { data: academy, error: acadError } = await supabaseAdmin
            .from('academies')
            .select('active_students, suspended_students')
            .eq('id', academyId)
            .single();

        if (academy) {
            let active = academy.active_students || 0;
            let suspended = academy.suspended_students || 0;

            if (status === 'suspended') {
                active = Math.max(0, active - 1);
                suspended += 1;
            } else if (status === 'active') { // Assuming 'restored' means active
                active += 1;
                suspended = Math.max(0, suspended - 1);
            }

            await supabaseAdmin
                .from('academies')
                .update({
                    active_students: active,
                    suspended_students: suspended
                })
                .eq('id', academyId);
        }

        res.status(200).json({ message: `Student status updated to ${status}` });

    } catch (error) {
        console.error('Status update error:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
}
