const path = require('path');
console.log('Current directory:', process.cwd());
console.log('__dirname:', __dirname);

try {
    console.log('Requiring firebase-admin...');
    require('firebase-admin');
    console.log('firebase-admin OK');

    console.log('Requiring @supabase/supabase-js...');
    require('@supabase/supabase-js');
    console.log('@supabase/supabase-js OK');

    console.log('Requiring dotenv...');
    require('dotenv');
    console.log('dotenv OK');

    console.log('Requiring serviceAccountKey.json...');
    require('./serviceAccountKey.json');
    console.log('serviceAccountKey.json OK');

} catch (error) {
    console.error('REQUIRE ERROR:', error);
}
