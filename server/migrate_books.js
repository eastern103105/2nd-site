const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function migrateBooks() {
    console.log('Starting migration of books metadata...');
    try {
        // 1. Fetch all words
        console.log('Fetching all words (this might take a while)...');
        const wordsSnapshot = await db.collection('words').get();
        console.log(`Found ${wordsSnapshot.size} words.`);

        const books = {}; // academyId -> { bookName: count }

        // 2. Calculate counts
        wordsSnapshot.forEach(doc => {
            const data = doc.data();
            const academyId = data.academyId || 'academy_default';
            const bookName = data.book_name || '기본';

            if (!books[academyId]) {
                books[academyId] = {};
            }

            if (!books[academyId][bookName]) {
                books[academyId][bookName] = 0;
            }

            books[academyId][bookName]++;
        });

        console.log('Calculated book counts:', books);

        // 3. Update books collection
        const batch = db.batch();
        let operationCount = 0;

        for (const [academyId, bookData] of Object.entries(books)) {
            for (const [bookName, count] of Object.entries(bookData)) {
                // Create a unique ID for the book document: academyId_bookName
                const docId = `${academyId}_${bookName}`;
                const bookRef = db.collection('books').doc(docId);

                batch.set(bookRef, {
                    academyId: academyId,
                    name: bookName,
                    totalWords: count,
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                });
                operationCount++;
            }
        }

        await batch.commit();
        console.log(`Successfully created/updated ${operationCount} book metadata documents.`);

    } catch (error) {
        console.error('Migration failed:', error);
    }
}

migrateBooks();
