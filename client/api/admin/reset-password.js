import { supabaseAdmin } from '../../supabaseAdmin.js';

export default async function handler(req, res) {
    // CORS
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const token = req.headers.authorization?.split('Bearer ')[1];
    if (!token) return res.status(401).json({ error: 'Missing token' });

    // Verify Admin
    // For now, we verify token is valid. Role check should be here or in RLS.
    // Original code had a 'requireAdmin' middleware.
    // We should fetching user metadata to check role.

    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) return res.status(401).json({ error: 'Unauthorized' });

    // Role Check
    const { data: profile } = await supabaseAdmin.from('users').select('role').eq('id', user.id).single();
    if (!profile || (profile.role !== 'admin' && profile.role !== 'super_admin')) {
        return res.status(403).json({ error: 'Insufficient permissions' });
    }

    const { uid, newPassword } = req.body;
    if (!uid || !newPassword) return res.status(400).json({ error: 'Missing uid or newPassword' });
    if (newPassword.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

    try {
        const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(uid, {
            password: newPassword
        });

        if (updateError) throw updateError;

        res.status(200).json({ message: 'Password updated successfully' });
    } catch (error) {
        console.error('Password reset error:', error);
        res.status(500).json({ error: 'Failed to update password: ' + error.message });
    }
}
