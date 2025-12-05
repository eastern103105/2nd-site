import { supabaseAdmin } from '../../supabaseAdmin.js';

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const token = req.headers.authorization?.split('Bearer ')[1];
    if (!token) return res.status(401).json({ error: 'Missing token' });

    // Verify User/Admin
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) return res.status(401).json({ error: 'Unauthorized' });

    // Check Admin Role
    const { data: profile } = await supabaseAdmin.from('users').select('role').eq('id', user.id).single();
    if (!profile || (profile.role !== 'admin' && profile.role !== 'super_admin')) {
        return res.status(403).json({ error: 'Insufficient permissions' });
    }

    try {
        // Fetch stats. Since we are moving to SQL, we can just query the 'academies' table directly.
        // It maintains active/suspended counts.
        const { data: academies, error } = await supabaseAdmin
            .from('academies')
            .select('id, active_students, suspended_students');

        if (error) throw error;

        const stats = {};
        academies.forEach(academy => {
            stats[academy.id] = {
                activeStudents: academy.active_students,
                suspendedStudents: academy.suspended_students
            };
        });

        res.status(200).json(stats);
    } catch (error) {
        console.error('Billing stats error:', error);
        res.status(500).json({ error: 'Failed to fetch stats' });
    }
}
