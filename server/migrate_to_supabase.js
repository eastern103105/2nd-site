const admin = require('firebase-admin');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
const fs = require('fs');

// Hardcoded Supabase Credentials for Migration Context
const SUPABASE_URL = 'https://bkapzqvccitsommhqhdy.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJrYXB6cXZjY2l0c29tbWhxaGR5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDk0NzcyMywiZXhwIjoyMDgwNTIzNzIzfQ.W62n7vAbNtz93czeVbIXXl4tqdU2NvtO6utoBnyQHrI';

console.log('Starting Migration Script...');

try {
    // 1. Load Service Account Key using fs
    const serviceAccountPath = path.join(__dirname, 'serviceAccountKey.json');
    console.log(`Loading Service Account from: ${serviceAccountPath}`);

    if (!fs.existsSync(serviceAccountPath)) {
        throw new Error(`Service Account Key file not found at ${serviceAccountPath}`);
    }

    const serviceAccountRaw = fs.readFileSync(serviceAccountPath, 'utf8');
    const serviceAccount = JSON.parse(serviceAccountRaw);
    console.log('STEP 1 OK: Service Account loaded. Project:', serviceAccount.project_id);

    // 2. Initialize Firebase
    if (!admin.apps.length) {
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
    }
    const db = admin.firestore();
    console.log('STEP 2 OK: Firebase initialized.');

    // 3. Initialize Supabase
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    console.log('STEP 3 OK: Supabase initialized.');

    async function migrate() {
        console.log('--- Migration Start ---');

        // --- Academies ---
        console.log('Migrating Academies...');
        const academiesSnap = await db.collection('academies').get();
        console.log(`Found ${academiesSnap.size} academies.`);

        for (const doc of academiesSnap.docs) {
            const data = doc.data();
            const { error } = await supabase.from('academies').upsert({
                id: doc.id,
                name: data.name || doc.id,
                active_students: data.activeStudents || 0,
                suspended_students: data.suspendedStudents || 0,
                settings: data.settings || null
            });
            if (error) console.error(`Error migrating academy ${doc.id}:`, error);
        }

        // --- Users ---
        console.log('Migrating Users...');
        const usersSnap = await db.collection('users').get();
        console.log(`Found ${usersSnap.size} users.`);

        for (const doc of usersSnap.docs) {
            const data = doc.data();
            const email = data.email;

            if (!email) continue;

            const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
                email: email,
                password: 'temporary-password-123',
                email_confirm: true,
                user_metadata: { name: data.name }
            });

            let uuid = null;
            if (authUser && authUser.user) {
                uuid = authUser.user.id;
            } else if (authError) {
                // Existing user handling could go here
                // For now just continue
            }

            if (uuid) {
                const { error: profileError } = await supabase.from('users').upsert({
                    id: uuid,
                    email: email,
                    username: data.username,
                    name: data.name,
                    role: data.role || 'student',
                    academy_id: data.academyId,
                    status: data.status,
                    created_at: data.createdAt ? new Date(data.createdAt) : new Date(),
                });
                if (profileError) console.error(`Profile error for ${email}:`, profileError);
            }
        }

        // --- Books ---
        console.log('Migrating Books...');
        const booksSnap = await db.collection('books').get();
        for (const doc of booksSnap.docs) {
            const data = doc.data();
            const { error } = await supabase.from('books').upsert({
                id: doc.id,
                academy_id: data.academyId,
                name: data.name,
                total_words: data.totalWords,
                updated_at: data.updatedAt ? data.updatedAt.toDate() : new Date()
            });
            if (error) console.error(`Failed book ${doc.id}:`, error);
        }

        // --- Words ---
        console.log('Migrating Words (safety limit 1000)...');
        const wordsSnap = await db.collection('words').limit(1000).get();
        console.log(`Found ${wordsSnap.size} words.`);

        let wordCount = 0;
        for (const doc of wordsSnap.docs) {
            const data = doc.data();
            const { error } = await supabase.from('words').upsert({
                id: doc.id,
                academy_id: data.academyId,
                book_name: data.book_name,
                word: data.word,
                meaning: data.meaning,
                created_at: new Date()
            }, { onConflict: 'id' });

            if (error) console.error(`Failed word ${doc.id}:`, error);
            else wordCount++;

            if (wordCount % 100 === 0) console.log(`Migrated ${wordCount} words...`);
        }

        console.log('--- Migration Complete ---');
    }

    migrate().catch(err => {
        console.error('Migration Logic Error!');
        console.error('Code:', err.code);
        console.error('Message:', err.message);
    });

} catch (e) {
    console.error('Migration Script Startup Error:', e.message);
}
