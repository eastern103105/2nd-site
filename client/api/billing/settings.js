import { supabaseAdmin } from '../../supabaseAdmin.js';

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const token = req.headers.authorization?.split('Bearer ')[1];
    if (!token) return res.status(401).json({ error: 'Missing token' });

    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) return res.status(401).json({ error: 'Unauthorized' });

    // Check Admin Role
    const { data: profile } = await supabaseAdmin.from('users').select('role').eq('id', user.id).single();
    if (!profile || (profile.role !== 'admin' && profile.role !== 'super_admin')) {
        return res.status(403).json({ error: 'Insufficient permissions' });
    }

    const { academyId, billingType, pricePerStudent, flatRateAmount } = req.body;
    if (!academyId) return res.status(400).json({ error: 'Missing academyId' });

    try {
        const { error: updateError } = await supabaseAdmin
            .from('franchise_settings')
            .upsert({
                academy_id: academyId,
                billing_type: billingType || 'per_student',
                price_per_student: pricePerStudent || 0,
                flat_rate_amount: flatRateAmount || 0,
                updated_at: new Date()
            }, { onConflict: 'academy_id' });

        if (updateError) throw updateError;

        res.status(200).json({ message: 'Billing settings updated' });
    } catch (error) {
        console.error('Billing settings error:', error);
        res.status(500).json({ error: 'Failed to update settings' });
    }
}
