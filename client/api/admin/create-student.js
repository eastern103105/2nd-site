import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
});

export default async function handler(req, res) {
    // CORS 헤더
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { username, password, name, academyId } = req.body;

    if (!username || !password || !name) {
        return res.status(400).json({ error: '아이디, 비밀번호, 이름을 모두 입력해주세요.' });
    }

    if (password.length < 6) {
        return res.status(400).json({ error: '비밀번호는 6자 이상이어야 합니다.' });
    }

    const email = username.includes('@') ? username : `${username}@wordtest.com`;
    const finalAcademyId = academyId || 'academy_default';

    try {
        // 1. Supabase Auth에 사용자 생성
        const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
            email: email,
            password: password,
            email_confirm: true
        });

        if (authError) {
            console.error('Auth error:', authError);
            return res.status(400).json({ error: '계정 생성 실패: ' + authError.message });
        }

        const userId = authData.user.id;

        // 2. public.users 테이블에 프로필 생성
        const { error: profileError } = await supabaseAdmin.from('users').insert({
            id: userId,
            email: email,
            username: username,
            name: name,
            role: 'student',
            academy_id: finalAcademyId,
            status: 'active',
            book_name: '기본',
            current_word_index: 0,
            study_days: ['월', '화', '수', '목', '금'],
            words_per_session: 10
        });

        if (profileError) {
            console.error('Profile error:', profileError);
            // Auth 사용자 삭제 시도
            await supabaseAdmin.auth.admin.deleteUser(userId);
            return res.status(400).json({ error: '프로필 생성 실패: ' + profileError.message });
        }

        console.log(`Student created: ${username} (${userId})`);
        return res.status(200).json({
            message: '학생이 등록되었습니다!',
            userId: userId
        });

    } catch (error) {
        console.error('Create student error:', error);
        return res.status(500).json({ error: '학생 등록 실패: ' + error.message });
    }
}
