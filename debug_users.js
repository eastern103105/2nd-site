const admin = require('firebase-admin');
const serviceAccount = require('./server/serviceAccountKey.json');

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function debugUsers() {
    console.log('Fetching users...');
    const snapshot = await db.collection('users').where('role', '==', 'student').get();

    if (snapshot.empty) {
        console.log('No students found.');
        return;
    }

    console.log(`Found ${snapshot.size} students.`);
    snapshot.forEach(doc => {
        const data = doc.data();
        console.log(`User: ${doc.id}, Role: ${data.role}, AcademyId: ${data.academyId}, Status: ${data.status}`);
    });
}

debugUsers();
