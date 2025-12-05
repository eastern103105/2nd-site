const { createClient } = require('@supabase/supabase-js');

// Supabase 설정
const supabaseUrl = 'https://bkapzqvccitsommhqhdy.supabase.co';
const serviceRoleKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJrYXB6cXZjY2l0c29tbWhxaGR5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDk0NzcyMywiZXhwIjoyMDgwNTIzNzIzfQ.W62n7vAbNtz93czeVbIXXl4tqdU2NvtO6utoBnyQHrI';

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function promoteManager() {
    const email = 'manager@wordtest.com';

    console.log(`Searching for user: ${email}...`);

    // 1. users 테이블에서 해당 이메일 찾기
    const { data: user, error: findError } = await supabase
        .from('users')
        .select('*')
        .eq('email', email)
        .single();

    if (findError) {
        console.error('Error finding user:', findError.message);
        return;
    }

    console.log(`User found! ID: ${user.id}, Current Role: ${user.role}`);

    // 2. 관리자 권한 및 이름 업데이트
    const { error: updateError } = await supabase
        .from('users')
        .update({
            role: 'admin',
            name: '학원 관리자',
            username: 'manager'
        })
        .eq('id', user.id);

    if (updateError) {
        console.error('Error updating user:', updateError.message);
        return;
    }

    console.log('------------------------------------------------');
    console.log('✅ Manager promote successful!');
    console.log(`Role changed to: admin`);
    console.log('------------------------------------------------');
}

promoteManager();
