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

    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) return res.status(401).json({ error: 'Unauthorized' });

    // Check Admin Role
    const { data: profile } = await supabaseAdmin.from('users').select('role').eq('id', user.id).single();
    if (!profile || (profile.role !== 'admin' && profile.role !== 'super_admin')) {
        return res.status(403).json({ error: 'Insufficient permissions' });
    }

    const { year, month } = req.query;
    if (!year || !month) return res.status(400).json({ error: 'Missing year or month' });

    try {
        const startOfMonth = new Date(year, month - 1, 1);
        const endOfMonth = new Date(year, month, 0, 23, 59, 59, 999);

        // 1. Fetch all students
        const { data: students, error: usersError } = await supabaseAdmin
            .from('users')
            .select('*')
            .eq('role', 'student');

        if (usersError) throw usersError;

        // 2. Fetch all status logs up to end of month
        // supabase filters: lte = less than or equal
        const { data: logs, error: logsError } = await supabaseAdmin
            .from('student_status_logs')
            .select('*')
            .lte('changed_at', endOfMonth.toISOString())
            .order('changed_at', { ascending: true });

        if (logsError) throw logsError;

        const logsByStudent = {};
        logs.forEach(log => {
            if (!logsByStudent[log.student_id]) {
                logsByStudent[log.student_id] = [];
            }
            logsByStudent[log.student_id].push({
                status: log.status,
                date: new Date(log.changed_at)
            });
        });

        // 3. Fetch Franchise Settings
        const { data: settingsList, error: settingsError } = await supabaseAdmin
            .from('franchise_settings')
            .select('*');

        if (settingsError) throw settingsError;

        const franchiseSettings = {};
        settingsList.forEach(setting => {
            franchiseSettings[setting.academy_id] = setting;
        });

        const stats = {};

        // 4. Process each student
        students.forEach(student => {
            const studentId = student.id;
            const academyId = student.academy_id || 'academy_default';
            const createdAt = student.created_at ? new Date(student.created_at) : new Date(0);

            if (!stats[academyId]) {
                stats[academyId] = {
                    name: academyId,
                    totalStudents: 0,
                    billableStudents: 0,
                    totalCost: 0,
                    students: []
                };
            }

            let activeDays = 0;

            if (createdAt <= endOfMonth) {
                const effectiveStart = createdAt > startOfMonth ? createdAt : startOfMonth;
                const iterDate = new Date(effectiveStart);
                iterDate.setHours(23, 59, 59, 999);

                while (iterDate <= endOfMonth) {
                    const studentLogs = logsByStudent[studentId] || [];
                    let currentStatus = 'active';

                    for (let i = studentLogs.length - 1; i >= 0; i--) {
                        if (studentLogs[i].date <= iterDate) {
                            currentStatus = studentLogs[i].status;
                            break;
                        }
                    }

                    if (currentStatus === 'active') {
                        activeDays++;
                    }
                    iterDate.setDate(iterDate.getDate() + 1);
                }
            }

            const isBillable = activeDays >= 7;
            stats[academyId].totalStudents++;
            if (isBillable) stats[academyId].billableStudents++;

            stats[academyId].students.push({
                id: studentId,
                name: student.name,
                username: student.username,
                activeDays,
                isBillable,
                currentStatus: student.status
            });
        });

        // 5. Calculate Costs
        Object.keys(stats).forEach(academyId => {
            const settings = franchiseSettings[academyId] || { billing_type: 'per_student', price_per_student: 0, flat_rate_amount: 0 };

            if (settings.billing_type === 'flat') {
                stats[academyId].totalCost = parseInt(settings.flat_rate_amount || 0);
            } else {
                stats[academyId].totalCost = stats[academyId].billableStudents * parseInt(settings.price_per_student || 0);
            }
        });

        res.status(200).json(stats);

    } catch (error) {
        console.error('Monthly stats error:', error);
        res.status(500).json({ error: 'Failed to fetch monthly stats: ' + error.message });
    }
}
