/**
 * Cache Manager for Frontend Data
 * Reduces database reads by caching frequently accessed data in localStorage
 */

// Cache duration constants (in milliseconds)
export const CACHE_DURATION = {
    USER: 30 * 60 * 1000,           // 30 minutes - user profile data
    ACADEMY: 60 * 60 * 1000,        // 1 hour - academy settings
    CLASSES: 60 * 60 * 1000,        // 1 hour - class list
    BOOKS: 60 * 60 * 1000,          // 1 hour - book list
    ANNOUNCEMENTS: 10 * 60 * 1000,  // 10 minutes - announcements
    TEACHERS: 30 * 60 * 1000,       // 30 minutes - teacher list
    STUDENTS: 15 * 60 * 1000,       // 15 minutes - student list
    HISTORY: 5 * 60 * 1000,         // 5 minutes - test history
};

/**
 * Cache Manager
 */
export const cacheManager = {
    /**
     * Set data in cache with expiration
     * @param {string} key - Cache key
     * @param {any} data - Data to cache
     * @param {number} duration - Cache duration in milliseconds
     */
    set: (key, data, duration) => {
        try {
            const cacheEntry = {
                data,
                timestamp: Date.now(),
                duration,
                version: '1.0' // For future cache invalidation
            };
            localStorage.setItem(`cache_${key}`, JSON.stringify(cacheEntry));
        } catch (error) {
            console.warn(`Failed to cache ${key}:`, error);
            // If localStorage is full, clear old caches
            if (error.name === 'QuotaExceededError') {
                cacheManager.clearExpired();
            }
        }
    },

    /**
     * Get data from cache if not expired
     * @param {string} key - Cache key
     * @returns {any|null} Cached data or null if expired/not found
     */
    get: (key) => {
        try {
            const cached = localStorage.getItem(`cache_${key}`);
            if (!cached) return null;

            const { data, timestamp, duration } = JSON.parse(cached);

            // Check if cache is expired
            if (Date.now() - timestamp > duration) {
                localStorage.removeItem(`cache_${key}`);
                return null;
            }

            console.log(`[Cache] Hit: ${key}`);
            return data;
        } catch (error) {
            console.warn(`Failed to read cache ${key}:`, error);
            return null;
        }
    },

    /**
     * Invalidate (remove) specific cache entry
     * @param {string} key - Cache key to invalidate
     */
    invalidate: (key) => {
        localStorage.removeItem(`cache_${key}`);
        console.log(`[Cache] Invalidated: ${key}`);
    },

    /**
     * Invalidate multiple cache entries by pattern
     * @param {string} pattern - Pattern to match (e.g., 'user_' to clear all user caches)
     */
    invalidatePattern: (pattern) => {
        const keys = Object.keys(localStorage);
        let count = 0;

        keys.forEach(key => {
            if (key.startsWith(`cache_${pattern}`)) {
                localStorage.removeItem(key);
                count++;
            }
        });

        console.log(`[Cache] Invalidated ${count} entries matching: ${pattern}`);
    },

    /**
     * Clear all expired cache entries
     */
    clearExpired: () => {
        const keys = Object.keys(localStorage);
        let count = 0;

        keys.forEach(key => {
            if (key.startsWith('cache_')) {
                try {
                    const cached = localStorage.getItem(key);
                    if (cached) {
                        const { timestamp, duration } = JSON.parse(cached);
                        if (Date.now() - timestamp > duration) {
                            localStorage.removeItem(key);
                            count++;
                        }
                    }
                } catch (error) {
                    // Remove corrupted cache entries
                    localStorage.removeItem(key);
                    count++;
                }
            }
        });

        if (count > 0) {
            console.log(`[Cache] Cleared ${count} expired entries`);
        }
    },

    /**
     * Clear all cache entries
     */
    clearAll: () => {
        const keys = Object.keys(localStorage);
        let count = 0;

        keys.forEach(key => {
            if (key.startsWith('cache_')) {
                localStorage.removeItem(key);
                count++;
            }
        });

        console.log(`[Cache] Cleared all ${count} cache entries`);
    },

    /**
     * Get cache statistics
     * @returns {object} Cache stats
     */
    getStats: () => {
        const keys = Object.keys(localStorage);
        const cacheKeys = keys.filter(k => k.startsWith('cache_'));

        let totalSize = 0;
        let validCount = 0;
        let expiredCount = 0;

        cacheKeys.forEach(key => {
            const value = localStorage.getItem(key);
            if (value) {
                totalSize += value.length;
                try {
                    const { timestamp, duration } = JSON.parse(value);
                    if (Date.now() - timestamp > duration) {
                        expiredCount++;
                    } else {
                        validCount++;
                    }
                } catch (error) {
                    expiredCount++;
                }
            }
        });

        return {
            totalEntries: cacheKeys.length,
            validEntries: validCount,
            expiredEntries: expiredCount,
            totalSizeKB: (totalSize / 1024).toFixed(2),
            maxSizeKB: 5120 // localStorage limit is ~5MB
        };
    }
};

/**
 * Helper function to create cache key
 * @param {string} collection - Collection name
 * @param {string} id - Document/query identifier
 * @returns {string} Cache key
 */
export const createCacheKey = (collection, id = '') => {
    const userId = localStorage.getItem('userId') || 'anonymous';
    const academyId = localStorage.getItem('academyId') || 'default';
    return `${collection}_${academyId}_${userId}_${id}`.replace(/[^a-zA-Z0-9_]/g, '_');
};

// Auto-clear expired caches on module load
cacheManager.clearExpired();

export default cacheManager;
