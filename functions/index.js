const functions = require('firebase-functions');
const admin = require('firebase-admin');

admin.initializeApp();
const db = admin.firestore();

/**
 * Aggregate test results into daily summaries
 * Triggered when a new test result is created
 */
exports.aggregateTestResult = functions.firestore
    .document('test_results/{resultId}')
    .onCreate(async (snap, context) => {
        try {
            const result = snap.data();
            const { user_id, date, score, correct, total, book_name, test_mode } = result;

            if (!user_id || !date) {
                console.error('Missing required fields:', { user_id, date });
                return null;
            }

            // Create summary document ID
            const summaryId = `${user_id}_${date}`;
            const summaryRef = db.doc(`student_daily_summaries/${summaryId}`);

            // Get current summary or create new one
            const summaryDoc = await summaryRef.get();
            const currentData = summaryDoc.exists() ? summaryDoc.data() : {
                userId: user_id,
                date: date,
                academyId: result.academyId || 'academy_default',
                summary: {
                    totalTests: 0,
                    totalScore: 0,
                    totalCorrect: 0,
                    totalQuestions: 0,
                    booksStudied: [],
                    testModes: {}
                },
                testRefs: [],
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            };

            // Update summary data
            const newSummary = {
                ...currentData,
                summary: {
                    totalTests: currentData.summary.totalTests + 1,
                    totalScore: currentData.summary.totalScore + (score || 0),
                    totalCorrect: currentData.summary.totalCorrect + (correct || 0),
                    totalQuestions: currentData.summary.totalQuestions + (total || 0),
                    booksStudied: currentData.summary.booksStudied.includes(book_name)
                        ? currentData.summary.booksStudied
                        : [...currentData.summary.booksStudied, book_name],
                    testModes: {
                        ...currentData.summary.testModes,
                        [test_mode]: (currentData.summary.testModes[test_mode] || 0) + 1
                    }
                },
                testRefs: [
                    ...currentData.testRefs,
                    {
                        id: context.params.resultId,
                        time: result.timestamp || new Date().toISOString(),
                        score: score || 0,
                        book: book_name,
                        mode: test_mode
                    }
                ],
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            };

            // Calculate average score
            newSummary.summary.averageScore = Math.round(
                newSummary.summary.totalScore / newSummary.summary.totalTests
            );

            // Calculate accuracy
            newSummary.summary.accuracy = newSummary.summary.totalQuestions > 0
                ? Math.round((newSummary.summary.totalCorrect / newSummary.summary.totalQuestions) * 100)
                : 0;

            await summaryRef.set(newSummary);

            console.log(`Updated daily summary for ${user_id} on ${date}`);
            return null;

        } catch (error) {
            console.error('Error aggregating test result:', error);
            return null;
        }
    });

/**
 * Aggregate dollar transactions into daily summaries
 * Triggered when a dollar transaction is created
 */
exports.aggregateDollarTransaction = functions.firestore
    .document('dollar_transactions/{transactionId}')
    .onCreate(async (snap, context) => {
        try {
            const transaction = snap.data();
            const { user_id, amount, type, date } = transaction;

            if (!user_id || !date) {
                console.error('Missing required fields:', { user_id, date });
                return null;
            }

            // Create summary document ID
            const summaryId = `${user_id}_${date}`;
            const summaryRef = db.doc(`student_daily_summaries/${summaryId}`);

            // Get current summary or create minimal one
            const summaryDoc = await summaryRef.get();
            const currentData = summaryDoc.exists() ? summaryDoc.data() : {
                userId: user_id,
                date: date,
                academyId: transaction.academyId || 'academy_default',
                summary: {},
                testRefs: [],
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            };

            // Initialize dollar transactions if not exists
            if (!currentData.dollarTransactions) {
                currentData.dollarTransactions = {
                    earned: 0,
                    spent: 0,
                    transactions: []
                };
            }

            // Update dollar transactions
            const dollarUpdate = {
                ...currentData.dollarTransactions,
                transactions: [
                    ...currentData.dollarTransactions.transactions,
                    {
                        id: context.params.transactionId,
                        amount,
                        type,
                        time: transaction.timestamp || new Date().toISOString()
                    }
                ]
            };

            if (type === 'earn') {
                dollarUpdate.earned = currentData.dollarTransactions.earned + amount;
            } else if (type === 'spend') {
                dollarUpdate.spent = currentData.dollarTransactions.spent + amount;
            }

            dollarUpdate.balance = dollarUpdate.earned - dollarUpdate.spent;

            await summaryRef.set({
                ...currentData,
                dollarTransactions: dollarUpdate,
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true });

            console.log(`Updated dollar transactions for ${user_id} on ${date}`);
            return null;

        } catch (error) {
            console.error('Error aggregating dollar transaction:', error);
            return null;
        }
    });

/**
 * Cleanup old daily summaries (older than 90 days)
 * Scheduled to run daily at 2 AM
 */
exports.cleanupOldSummaries = functions.pubsub
    .schedule('0 2 * * *')
    .timeZone('Asia/Seoul')
    .onRun(async (context) => {
        try {
            const ninetyDaysAgo = new Date();
            ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
            const cutoffDate = ninetyDaysAgo.toISOString().split('T')[0];

            console.log(`Cleaning up summaries older than ${cutoffDate}`);

            const oldSummaries = await db.collection('student_daily_summaries')
                .where('date', '<', cutoffDate)
                .limit(500) // Process in batches
                .get();

            if (oldSummaries.empty) {
                console.log('No old summaries to clean up');
                return null;
            }

            const batch = db.batch();
            oldSummaries.docs.forEach(doc => {
                batch.delete(doc.ref);
            });

            await batch.commit();
            console.log(`Deleted ${oldSummaries.size} old summaries`);

            return null;
        } catch (error) {
            console.error('Error cleaning up old summaries:', error);
            return null;
        }
    });
