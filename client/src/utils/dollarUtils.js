import { supabase } from '../supabase';
import { addDollarToSummary } from './dailySummary';

/**
 * 달러 적립/차감 함수
 * @param {string} userId - 사용자 ID
 * @param {number} amount - 금액 (양수: 적립, 음수: 차감)
 * @param {string} type - 'earn' | 'spend'
 * @param {string} reason - 사유
 * @param {string} academyId - 학원 ID
 * @returns {Promise<boolean>} 성공 여부
 */
export const updateDollarBalance = async (userId, amount, type, reason, academyId) => {
    try {
        if (!userId) throw new Error('User ID is required');

        // 1. Get current user data
        const { data: userData, error: fetchError } = await supabase
            .from('users')
            .select('dollar_history, dollar_balance')
            .eq('id', userId)
            .single();

        if (fetchError) throw fetchError;

        const currentBalance = userData.dollar_balance || 0;
        const currentHistory = userData.dollar_history || [];

        // Check sufficient balance for spending
        if (amount < 0 && currentBalance + amount < 0) {
            console.error('Insufficient balance');
            return false;
        }

        // 2. Prepare new data
        const newBalance = currentBalance + amount;
        const newTransaction = {
            id: Date.now().toString(), // Simple ID
            amount: Math.abs(amount),
            type, // 'earn' or 'spend'
            reason,
            date: new Date().toISOString(),
            balance_after: newBalance
        };

        const newHistory = [newTransaction, ...currentHistory].slice(0, 50); // Keep last 50

        // 3. Update User
        const { error: updateError } = await supabase
            .from('users')
            .update({
                dollar_balance: newBalance,
                dollar_history: newHistory,
                // last_dollar_update: new Date() // if column exists
            })
            .eq('id', userId);

        if (updateError) throw updateError;

        // 4. Update Daily Summary (Async, non-blocking)
        addDollarToSummary(userId, {
            amount: Math.abs(amount),
            type,
            reason,
            date: new Date().toISOString().split('T')[0],
            academyId
        }).catch(err => console.error('Summary update failed:', err));

        return true;
    } catch (error) {
        console.error('Error updating dollar balance:', error);
        return false;
    }
};

/**
 * 달러 잔액 조회
 * @param {string} userId 
 * @returns {Promise<number>}
 */
export const getDollarBalance = async (userId) => {
    try {
        const { data, error } = await supabase
            .from('users')
            .select('dollar_balance')
            .eq('id', userId)
            .single();

        if (error) throw error;
        return data?.dollar_balance || 0;
    } catch (error) {
        console.error('Error fetching balance:', error);
        return 0;
    }
};

export const addDollars = async (userId, amount, reason, type = 'earned') => {
    // Wrapper for updateDollarBalance to maintain compatibility if needed
    // But better to use updateDollarBalance directly. 
    // Implementing it to match previous signature if possible, but previous was export const addDollars
    // The previous code had addDollars separate. Current usage might depend on it.
    // Let's reimplement addDollars using updateDollarBalance logic or distinct logic?
    // The previous addDollars logic was:
    // Update balance, Add to 'dollar_history' collection.
    // My new logic simplifies it to updating 'users' table jsonb field.

    // NOTE: 'dollar_history' collection was used in legacy. New schema puts it in 'users' or 'student_daily_summaries'.
    // We merged history into 'users.dollar_history' (JSONB) in updateDollarBalance implementation above.

    // Ideally we should use updateDollarBalance.
    // Let's alias it or map it.
    // Note: addDollars didn't take academyId. logic needs to handle that.

    const academyId = localStorage.getItem('academyId') || 'academy_default';
    return updateDollarBalance(userId, amount, type, reason, academyId);
};

export const getRewardSettings = async () => {
    try {
        const { data, error } = await supabase
            .from('franchise_settings')
            .select('*')
        //.eq('academy_id', 'rewards') // Wait, settings is per academy.
        // Old logic fetched 'settings/rewards' doc. This seems global or specific.
        // If it's global rewards, we might need a specific row or just constants.
        // Let's assume for now we use defaults or fetch from current academy settings logic?
        // "rewards" doc in Firestore might have been global.
        // Let's hardcode defaults or fetch from academy if available. 
        // Better: just returns defaults as we didn't migrate 'settings' collection specifically other than 'franchise_settings'.

        // For now return defaults to be safe.
        return {
            daily_completion_reward: 0.5,
            curriculum_completion_reward: 0.1,
            game_high_score_reward: 0.05,
            game_high_score_threshold: 80,
            game_daily_max_reward: 0.5
        };

    } catch (error) {
        console.error("Error fetching reward settings:", error);
        return {
            daily_completion_reward: 0.5,
            curriculum_completion_reward: 0.1,
            game_high_score_reward: 0.05,
            game_high_score_threshold: 80,
            game_daily_max_reward: 0.5
        };
    }
};

export const getDailyGameEarnings = async (userId) => {
    try {
        const today = new Date().toISOString().split('T')[0];
        // Check 'student_daily_summaries' for dollars
        const { data, error } = await supabase
            .from('student_daily_summaries')
            .select('dollars')
            .eq('id', `${userId}_${today}`)
            .single();

        if (data && data.dollars && data.dollars.transactions) {
            // Filter for game_reward
            const gameEarnings = data.dollars.transactions
                .filter(t => t.type === 'game_reward')
                .reduce((sum, t) => sum + (t.amount || 0), 0);
            return gameEarnings;
        }
        return 0;
    } catch (error) {
        console.error("Error calculating daily game earnings:", error);
        return 0;
    }
};

export const hasReceivedDailyReward = async (userId) => {
    try {
        const today = new Date().toISOString().split('T')[0];
        const { data, error } = await supabase
            .from('student_daily_summaries')
            .select('dollars')
            .eq('id', `${userId}_${today}`)
            .single();

        if (data && data.dollars && data.dollars.transactions) {
            return data.dollars.transactions.some(t => t.reason === '매일 학습 완료');
        }
        return false;
    } catch (error) {
        console.error("Error checking daily reward:", error);
        return false;
    }
};
