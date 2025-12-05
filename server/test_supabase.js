const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://bkapzqvccitsommhqhdy.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJrYXB6cXZjY2l0c29tbWhxaGR5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDk0NzcyMywiZXhwIjoyMDgwNTIzNzIzfQ.W62n7vAbNtz93czeVbIXXl4tqdU2NvtO6utoBnyQHrI';

try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    console.log('Supabase Init OK');

    supabase.from('academies').select('*', { count: 'exact', head: true })
        .then(({ count, error }) => {
            if (error) {
                console.error('SUPABASE ERROR:', error.message);
            } else {
                console.log('Supabase Academies Count:', count);
            }
        })
        .catch(err => console.error('SUPABASE EXCEPTION:', err.message));

} catch (e) {
    console.error('SETUP ERROR:', e.message);
}
