const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://bkapzqvccitsommhqhdy.supabase.co';
const serviceRoleKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJrYXB6cXZjY2l0c29tbWhxaGR5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDk0NzcyMywiZXhwIjoyMDgwNTIzNzIzfQ.W62n7vAbNtz93czeVbIXXl4tqdU2NvtO6utoBnyQHrI';

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function checkSchema() {
    console.log('[Check 1] WORDS table');
    const { data: words, error: wordsError } = await supabase.from('words').select('*').limit(1);
    if (wordsError) {
        console.log('Error accessing words table:', wordsError.message);
    } else if (words.length > 0) {
        console.log('Words Columns:', Object.keys(words[0]).join(', '));
    } else {
        console.log('Words table exists but is empty. Trying insert probe...');
        const { error: insertErr } = await supabase.from('words').insert({ id: 'probe', word: 'probe' });
        if (insertErr && insertErr.message.includes('column "word" of relation "words" does not exist')) {
            console.log('Column "word" MISSING. Likely uses "english".');
        } else {
            console.log('Column "word" EXISTS or other error:', insertErr ? insertErr.message : 'Success');
        }
        await supabase.from('words').delete().eq('id', 'probe');
    }

    console.log('\n[Check 2] CLASSES table');
    const { error: classesError } = await supabase.from('classes').select('*').limit(1);
    if (classesError) {
        console.log('Classes table status:', classesError.code === '42P01' ? 'MISSING (42P01)' : classesError.message);
    } else {
        console.log('Classes table EXISTS.');
    }
}

checkSchema();
