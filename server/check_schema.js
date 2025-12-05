const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://bkapzqvccitsommhqhdy.supabase.co';
const serviceRoleKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJrYXB6cXZjY2l0c29tbWhxaGR5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDk0NzcyMywiZXhwIjoyMDgwNTIzNzIzfQ.W62n7vAbNtz93czeVbIXXl4tqdU2NvtO6utoBnyQHrI';

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function checkSchema() {
    console.log('Checking "words" table columns...');

    // Insert a dummy row to test columns? No, that messes data.
    // Try to select empty.
    const { data, error } = await supabase.from('words').select('*').limit(1);

    if (error) {
        console.error('Error selecting:', error.message);
        return;
    }

    if (data.length === 0) {
        console.log('Table is empty. Attempting detailed insert test...');
        // Try inserting with 'english'
        const { error: err1 } = await supabase.from('words').insert({
            id: 'test-1',
            academy_id: 'academy_default',
            english: 'test',
            korean: 'test',
            word_number: 1
        }).select();

        if (err1) {
            console.log("Insert with 'english/korean/word_number' FAILED:", err1.message);
        } else {
            console.log("Insert with 'english/korean/word_number' SUCCESS!");
            await supabase.from('words').delete().eq('id', 'test-1');
            return;
        }

        // Try insert with 'word/meaning'
        const { error: err2 } = await supabase.from('words').insert({
            id: 'test-2',
            academy_id: 'academy_default',
            word: 'test',
            meaning: 'test'
        }).select();

        if (err2) {
            console.log("Insert with 'word/meaning' FAILED:", err2.message);
        } else {
            console.log("Insert with 'word/meaning' SUCCESS! (Old Schema)");
            await supabase.from('words').delete().eq('id', 'test-2');
        }
    } else {
        console.log('Existing columns based on data:', Object.keys(data[0]));
    }
}

checkSchema();
