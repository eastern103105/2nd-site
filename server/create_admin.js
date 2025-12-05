const { createClient } = require('@supabase/supabase-js');

// Supabase 설정 (자동으로 입력됨)
const supabaseUrl = 'https://bkapzqvccitsommhqhdy.supabase.co';
const serviceRoleKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJrYXB6cXZjY2l0c29tbWhxaGR5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDk0NzcyMywiZXhwIjoyMDgwNTIzNzIzfQ.W62n7vAbNtz93czeVbIXXl4tqdU2NvtO6utoBnyQHrI';

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function createAdminUser() {
    const email = 'admin@wordtest.com'; // 원하는 아이디 (이메일 형식)
    const password = 'admin1234!';    // 원하는 비밀번호
    const name = '관리자';

    console.log(`Creating user: ${email}...`);

    // 1. Auth 유저 생성 (비밀번호 설정 포함)
    const { data: { user }, error: authError } = await supabase.auth.admin.createUser({
        email: email,
        password: password,
        email_confirm: true
    });

    if (authError) {
        console.error('Error creating auth user:', authError.message);
        return;
    }

    console.log(`Auth user created! User ID: ${user.id}`);

    // 2. Public Profile 생성
    const { error: dbError } = await supabase
        .from('users')
        .insert({
            id: user.id,
            email: email,
            username: email.split('@')[0],
            name: name,
            role: 'super_admin', // 최고 관리자 권한 부여
            academy_id: 'academy_default',
            status: 'active'
        });

    if (dbError) {
        console.error('Error creating public profile:', dbError.message);
        return;
    }

    console.log('------------------------------------------------');
    console.log('✅ User created successfully!');
    console.log(`ID: ${email}`);
    console.log(`PW: ${password}`);
    console.log('------------------------------------------------');
}

createAdminUser();
