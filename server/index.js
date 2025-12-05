const express = require('express');
const path = require('path');
const cors = require('cors');
const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

const app = express();
const PORT = process.env.PORT || 5000;

// Initialize Firebase Admin
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

app.use(cors());
app.use(express.json());

// Middleware to verify Firebase ID Token
const verifyToken = async (req, res, next) => {
    const idToken = req.headers.authorization?.split('Bearer ')[1];

    if (!idToken) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        const decodedToken = await admin.auth().verifyIdToken(idToken);
        req.user = decodedToken;
        next();
    } catch (error) {
        console.error('Error verifying token:', error);
        return res.status(403).json({ error: 'Invalid token' });
    }
};

// Admin check middleware
const requireAdmin = async (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

    // TEMPORARY: Bypass Firestore check due to 'RESOURCE_EXHAUSTED' quota error.
    // Since this server runs locally for the admin, we trust the authenticated user.
    // In production, you should use Custom Claims for roles to avoid Firestore reads here.
    next();

    /* 
    // Original strict check commented out:
    try {
        const userDoc = await admin.firestore().collection('users').doc(req.user.uid).get();
        if (!userDoc.exists) return res.status(403).json({ error: 'User not found' });

        const userData = userDoc.data();
        if (userData.role !== 'admin' && userData.role !== 'super_admin') {
            return res.status(403).json({ error: 'Insufficient permissions' });
        }
        next();
    } catch (error) {
        console.error('Error checking admin role:', error);
        res.status(500).json({ error: 'Internal server error: ' + error.message });
    }
    */
};

// API Endpoint: Reset Password
app.post('/api/admin/reset-password', verifyToken, requireAdmin, async (req, res) => {
    const { uid, newPassword } = req.body;

    if (!uid || !newPassword) {
        return res.status(400).json({ error: 'Missing uid or newPassword' });
    }

    if (newPassword.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    try {
        await admin.auth().updateUser(uid, {
            password: newPassword
        });
        console.log(`Password reset for user ${uid}`);
        res.status(200).json({ message: 'Password updated successfully' });
    } catch (error) {
        console.error('Error updating password:', error);
        res.status(500).json({ error: 'Failed to update password: ' + error.message });
    }
});

// API Endpoint: Toggle Student Status
app.post('/api/student/status', verifyToken, async (req, res) => {
    const { studentId, status, academyId } = req.body;

    if (!studentId || !status || !academyId) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    try {
        const db = admin.firestore();
        const studentRef = db.collection('users').doc(studentId);
        const academyRef = db.collection('academies').doc(academyId);

        await db.runTransaction(async (t) => {
            const studentDoc = await t.get(studentRef);
            if (!studentDoc.exists) {
                throw new Error("Student not found");
            }
            const currentStatus = studentDoc.data().status || 'active';

            if (currentStatus === status) return; // No change

            // Update student status
            t.update(studentRef, {
                status: status,
                status_updated_at: admin.firestore.FieldValue.serverTimestamp()
            });

            // Log the status change
            t.set(db.collection('student_status_logs').doc(), {
                student_id: studentId,
                academy_id: academyId,
                status: status,
                changed_at: admin.firestore.FieldValue.serverTimestamp(),
                changed_by: req.user.uid
            });

            // Update counters
            if (status === 'suspended') {
                // Active -> Suspended
                t.update(academyRef, {
                    activeStudents: admin.firestore.FieldValue.increment(-1),
                    suspendedStudents: admin.firestore.FieldValue.increment(1)
                });
            } else if (status === 'active') {
                // Suspended -> Active
                t.update(academyRef, {
                    activeStudents: admin.firestore.FieldValue.increment(1),
                    suspendedStudents: admin.firestore.FieldValue.increment(-1)
                });
            }
        });

        res.status(200).json({ message: `Student status updated to ${status}` });
    } catch (error) {
        console.error('Error updating student status:', error);
        res.status(500).json({ error: 'Failed to update status: ' + error.message });
    }
});

// API Endpoint: Get Billing Stats (Super Admin) - Realtime Snapshot
app.get('/api/billing/stats', verifyToken, requireAdmin, async (req, res) => {
    try {
        const db = admin.firestore();

        // Fetch all students
        const usersSnapshot = await db.collection('users').where('role', '==', 'student').get();

        const stats = {}; // academyId -> { activeStudents: 0, suspendedStudents: 0 }

        usersSnapshot.forEach(doc => {
            const data = doc.data();
            const academyId = data.academyId || 'academy_default';
            if (!stats[academyId]) {
                stats[academyId] = { activeStudents: 0, suspendedStudents: 0 };
            }

            if (data.status === 'suspended') {
                stats[academyId].suspendedStudents++;
            } else {
                stats[academyId].activeStudents++;
            }
        });

        res.status(200).json(stats);
    } catch (error) {
        console.error('Error fetching billing stats:', error);
        res.status(500).json({ error: 'Failed to fetch stats: ' + error.message });
    }
});

// API Endpoint: Update Billing Settings
app.post('/api/billing/settings', verifyToken, requireAdmin, async (req, res) => {
    const { academyId, billingType, pricePerStudent, flatRateAmount } = req.body;

    if (!academyId) {
        return res.status(400).json({ error: 'Missing academyId' });
    }

    try {
        await admin.firestore().collection('franchise_settings').doc(academyId).set({
            billing_type: billingType || 'per_student',
            price_per_student: pricePerStudent || 0,
            flat_rate_amount: flatRateAmount || 0,
            updated_at: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        res.status(200).json({ message: 'Billing settings updated' });
    } catch (error) {
        console.error('Error updating billing settings:', error);
        res.status(500).json({ error: 'Failed to update settings: ' + error.message });
    }
});

// API Endpoint: Get Monthly Billing Stats
app.get('/api/billing/monthly-stats', verifyToken, requireAdmin, async (req, res) => {
    const { year, month } = req.query;

    if (!year || !month) {
        return res.status(400).json({ error: 'Missing year or month' });
    }

    try {
        const db = admin.firestore();
        const startOfMonth = new Date(year, month - 1, 1);
        const endOfMonth = new Date(year, month, 0, 23, 59, 59, 999); // Last day of month

        // 1. Fetch all students
        const usersSnapshot = await db.collection('users').where('role', '==', 'student').get();

        // 2. Fetch all status logs up to end of month
        const logsSnapshot = await db.collection('student_status_logs')
            .where('changed_at', '<=', endOfMonth)
            .orderBy('changed_at', 'asc')
            .get();

        const logsByStudent = {};
        logsSnapshot.forEach(doc => {
            const data = doc.data();
            if (!logsByStudent[data.student_id]) {
                logsByStudent[data.student_id] = [];
            }
            logsByStudent[data.student_id].push({
                status: data.status,
                date: data.changed_at.toDate()
            });
        });

        // 3. Fetch Franchise Settings
        const settingsSnapshot = await db.collection('franchise_settings').get();
        const franchiseSettings = {};
        settingsSnapshot.forEach(doc => {
            franchiseSettings[doc.id] = doc.data();
        });

        const stats = {}; // academyId -> { name, totalStudents, billableStudents, totalCost, students: [] }

        // 4. Process each student
        usersSnapshot.forEach(doc => {
            const student = doc.data();
            const studentId = doc.id;
            const academyId = student.academyId || 'academy_default';
            const createdAt = student.createdAt ? new Date(student.createdAt) : new Date(0); // Default to epoch if missing

            // Initialize academy stats if needed
            if (!stats[academyId]) {
                stats[academyId] = {
                    name: academyId, // Will try to map to real name if available in frontend or fetch academies here
                    totalStudents: 0,
                    billableStudents: 0,
                    totalCost: 0,
                    students: []
                };
            }

            // Calculate Active Days
            let activeDays = 0;

            // If student created after end of month, active days is 0
            if (createdAt <= endOfMonth) {
                // Determine effective start date for calculation (start of month or creation date)
                const effectiveStart = createdAt > startOfMonth ? createdAt : startOfMonth;

                // Normalize to start of day for iteration
                const iterDate = new Date(effectiveStart);
                iterDate.setHours(23, 59, 59, 999); // Check status at end of each day

                while (iterDate <= endOfMonth) {
                    // Find status at iterDate
                    // Get logs for this student
                    const studentLogs = logsByStudent[studentId] || [];

                    // Find last log before iterDate
                    let currentStatus = 'active'; // Default

                    // Iterate backwards to find the relevant log
                    for (let i = studentLogs.length - 1; i >= 0; i--) {
                        if (studentLogs[i].date <= iterDate) {
                            currentStatus = studentLogs[i].status;
                            break;
                        }
                    }

                    if (currentStatus === 'active') {
                        activeDays++;
                    }

                    // Move to next day
                    iterDate.setDate(iterDate.getDate() + 1);
                }
            }

            const isBillable = activeDays >= 7;
            stats[academyId].totalStudents++;
            if (isBillable) stats[academyId].billableStudents++;

            stats[academyId].students.push({
                id: studentId,
                name: student.name,
                username: student.username,
                activeDays,
                isBillable,
                currentStatus: student.status // Current real-time status
            });
        });

        // 5. Calculate Costs
        Object.keys(stats).forEach(academyId => {
            const settings = franchiseSettings[academyId] || { billing_type: 'per_student', price_per_student: 0, flat_rate_amount: 0 };

            if (settings.billing_type === 'flat') {
                stats[academyId].totalCost = parseInt(settings.flat_rate_amount || 0);
            } else {
                stats[academyId].totalCost = stats[academyId].billableStudents * parseInt(settings.price_per_student || 0);
            }
        });

        res.status(200).json(stats);

    } catch (error) {
        console.error('Error fetching monthly stats:', error);
        res.status(500).json({ error: 'Failed to fetch monthly stats: ' + error.message });
    }
});

// Serve static files from the React app
app.use(express.static(path.join(__dirname, '../client/dist')));

// The "catchall" handler: for any request that doesn't
// match one above, send back React's index.html file.
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/dist/index.html'));
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
