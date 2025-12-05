const { createClient } = require('@supabase/supabase-js');

// Supabase 설정
const supabaseUrl = 'https://bkapzqvccitsommhqhdy.supabase.co';
const serviceRoleKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJrYXB6cXZjY2l0c29tbWhxaGR5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDk0NzcyMywiZXhwIjoyMDgwNTIzNzIzfQ.W62n7vAbNtz93czeVbIXXl4tqdU2NvtO6utoBnyQHrI';

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function createManager() {
    console.log('Searching for an academy...');

    // 1. 학원 찾기 또는 생성
    let academyId = 'academy_default';
    const { data: academies } = await supabase.from('academies').select('id, name').limit(1);

    if (academies && academies.length > 0) {
        academyId = academies[0].id;
        console.log(`Found academy: ${academies[0].name} (${academyId})`);
    } else {
        console.log('No academy found. Creating default academy...');
        const { error: academyError } = await supabase.from('academies').insert({
            id: academyId,
            name: '이스턴 영어 학원',
            active_students: 0
        });
        if (academyError) {
            // 이미 존재할 수도 있음
            console.log('Academy might already exist or error:', academyError.message);
        }
    }

    const email = 'manager@wordtest.com';
    const password = 'manager1234!';
    const name = '학원 관리자';

    console.log(`Creating user: ${email}...`);

    // 2. Auth 유저 생성
    const { data: { user }, error: authError } = await supabase.auth.admin.createUser({
        email: email,
        password: password,
        email_confirm: true
    });

    if (authError) {
        console.error('Error creating auth user:', authError.message);
        return;
    }

    // 3. Public Profile 생성 (Admin 역할)
    const { error: dbError } = await supabase
        .from('users')
        .insert({
            id: user.id,
            email: email,
            username: email.split('@')[0],
            name: name,
            role: 'admin', // 일반 관리자
            academy_id: academyId,
            status: 'active'
        });

    if (dbError) {
        console.error('Error creating public profile:', dbError.message);
        return;
    }

    console.log('------------------------------------------------');
    console.log('✅ Manager created successfully!');
    console.log(`Academy: ${academyId}`);
    console.log(`ID: ${email}`);
    console.log(`PW: ${password}`);
    console.log('------------------------------------------------');
}

createManager();
