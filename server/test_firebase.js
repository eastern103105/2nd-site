const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

try {
    const serviceAccountPath = path.join(__dirname, 'serviceAccountKey.json');
    const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
    console.log('Service Account Project:', serviceAccount.project_id);

    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
    const db = admin.firestore();
    console.log('Firebase Init OK');

    db.collection('academies').get()
        .then(snap => {
            console.log('Academies Count:', snap.size);
            process.exit(0);
        })
        .catch(err => {
            console.log('ERRCODE:', err.code);
            console.log('MSG:', err.message ? err.message.substring(0, 50) : 'No Msg');
            process.exit(1);
        });

} catch (e) {
    console.error('SETUP ERROR:', e.message);
}
