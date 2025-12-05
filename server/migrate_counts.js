const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function migrateCounts() {
    console.log('Starting migration of student counts...');
    try {
        // 1. Fetch all students
        const usersSnapshot = await db.collection('users').where('role', '==', 'student').get();
        console.log(`Found ${usersSnapshot.size} students.`);

        const counts = {}; // academyId -> { active: 0, suspended: 0 }

        // 2. Calculate counts
        usersSnapshot.forEach(doc => {
            const data = doc.data();
            const academyId = data.academyId;

            if (!academyId) return;

            if (!counts[academyId]) {
                counts[academyId] = { active: 0, suspended: 0 };
            }

            if (data.status === 'suspended') {
                counts[academyId].suspended++;
            } else {
                counts[academyId].active++;
            }
        });

        console.log('Calculated counts:', counts);

        // 3. Update academies collection
        const batch = db.batch();
        let operationCount = 0;

        for (const [academyId, stats] of Object.entries(counts)) {
            const academyRef = db.collection('academies').doc(academyId);
            batch.update(academyRef, {
                activeStudents: stats.active,
                suspendedStudents: stats.suspended
            });
            operationCount++;
        }

        await batch.commit();
        console.log(`Successfully updated ${operationCount} academies.`);

    } catch (error) {
        console.error('Migration failed:', error);
    }
}

migrateCounts();
