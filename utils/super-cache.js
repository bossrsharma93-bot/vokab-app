class SuperCache {
    constructor() {
        this.cache = new Map();
        this.stats = { 
            hits: 0, 
            misses: 0, 
            evictions: 0,
            totalSize: 0,
            averageTtl: 0
        };
        this.maxSize = 10000;
        this.defaultTTL = 3600; // 1 hour in seconds
        this.hitRateHistory = [];
        this.keyTimestamps = new Map();
    }
    
    get(key) {
        const item = this.cache.get(key);
        if (item && item.expiry > Date.now()) {
            this.stats.hits++;
            this.updateHitRate();
            return item.value;
        }
        if (item) {
            this.cache.delete(key);
            this.keyTimestamps.delete(key);
            this.stats.evictions++;
        }
        this.stats.misses++;
        this.updateHitRate();
        return null;
    }
    
    set(key, value, ttl = this.defaultTTL, options = {}) {
        const { priority = 'normal', compress = false, tags = [] } = options;
        
        // Auto cleanup if cache is too large
        if (this.cache.size >= this.maxSize) {
            this.cleanup();
        }
        
        let storedValue = value;
        if (compress && typeof value === 'string' && value.length > 1000) {
            storedValue = this.compress(value);
        }
        
        const item = {
            value: storedValue,
            expiry: Date.now() + (ttl * 1000),
            createdAt: Date.now(),
            priority,
            tags,
            compressed: compress && value.length > 1000,
            size: JSON.stringify(storedValue).length
        };
        
        this.cache.set(key, item);
        this.keyTimestamps.set(key, Date.now());
        this.stats.totalSize += item.size;
        this.stats.averageTtl = (this.stats.averageTtl + ttl) / 2;
        
        return true;
    }
    
    getBatch(keys) {
        const results = {};
        for (const key of keys) {
            results[key] = this.get(key);
        }
        return results;
    }
    
    setBatch(items, ttl = this.defaultTTL) {
        const results = {};
        for (const [key, value] of Object.entries(items)) {
            results[key] = this.set(key, value, ttl);
        }
        return results;
    }
    
    getByTag(tag) {
        const results = [];
        for (const [key, item] of this.cache) {
            if (item.tags && item.tags.includes(tag)) {
                results.push({ key, value: item.value, expiry: item.expiry });
            }
        }
        return results;
    }
    
    deleteByTag(tag) {
        let deleted = 0;
        for (const [key, item] of this.cache) {
            if (item.tags && item.tags.includes(tag)) {
                this.cache.delete(key);
                this.keyTimestamps.delete(key);
                deleted++;
            }
        }
        this.stats.evictions += deleted;
        return { deleted };
    }
    
    has(key) {
        const item = this.cache.get(key);
        return item && item.expiry > Date.now();
    }
    
    delete(key) {
        const deleted = this.cache.delete(key);
        this.keyTimestamps.delete(key);
        if (deleted) this.stats.evictions++;
        return deleted;
    }
    
    clear() {
        const cleared = this.cache.size;
        this.cache.clear();
        this.keyTimestamps.clear();
        this.stats = { 
            hits: 0, 
            misses: 0, 
            evictions: 0,
            totalSize: 0,
            averageTtl: 0
        };
        this.hitRateHistory = [];
        return { success: true, cleared };
    }
    
    cleanup() {
        const now = Date.now();
        let removedCount = 0;
        
        // Remove expired items
        for (const [key, item] of this.cache) {
            if (item.expiry <= now) {
                this.cache.delete(key);
                this.keyTimestamps.delete(key);
                removedCount++;
            }
        }
        
        this.stats.evictions += removedCount;
        
        // If still too large, remove oldest/lowest priority
        if (this.cache.size >= this.maxSize) {
            const sorted = Array.from(this.cache.entries())
                .sort((a, b) => {
                    // Priority order: high > normal > low
                    const priorityOrder = { high: 3, normal: 2, low: 1 };
                    const priorityDiff = priorityOrder[b[1].priority] - priorityOrder[a[1].priority];
                    if (priorityDiff !== 0) return priorityDiff;
                    return a[1].createdAt - b[1].createdAt;
                });
            
            const toRemove = this.cache.size - Math.floor(this.maxSize * 0.8);
            for (let i = 0; i < toRemove; i++) {
                this.cache.delete(sorted[i][0]);
                this.keyTimestamps.delete(sorted[i][0]);
                this.stats.evictions++;
            }
        }
        
        // Update total size
        this.stats.totalSize = Array.from(this.cache.values()).reduce((sum, item) => sum + item.size, 0);
    }
    
    compress(text) {
        // Simple compression for large strings
        if (text.length < 1000) return text;
        return Buffer.from(text).toString('base64');
    }
    
    decompress(compressed) {
        try {
            const decompressed = Buffer.from(compressed, 'base64').toString();
            return decompressed;
        } catch(e) {
            return compressed;
        }
    }
    
    updateHitRate() {
        const total = this.stats.hits + this.stats.misses;
        const hitRate = total === 0 ? 0 : (this.stats.hits / total * 100);
        this.hitRateHistory.push({ timestamp: Date.now(), hitRate });
        
        if (this.hitRateHistory.length > 100) this.hitRateHistory.shift();
    }
    
    getHitRateHistory(limit = 20) {
        return this.hitRateHistory.slice(-limit);
    }
    
    getKeys() {
        return Array.from(this.cache.keys());
    }
    
    getValues() {
        return Array.from(this.cache.values()).map(item => item.value);
    }
    
    getStats() {
        const total = this.stats.hits + this.stats.misses;
        const hitRate = total === 0 ? 0 : (this.stats.hits / total * 100).toFixed(1);
        
        return {
            hits: this.stats.hits,
            misses: this.stats.misses,
            hitRate: `${hitRate}%`,
            size: this.cache.size,
            maxSize: this.maxSize,
            evictions: this.stats.evictions,
            utilization: `${(this.cache.size / this.maxSize * 100).toFixed(1)}%`,
            totalSize: `${(this.stats.totalSize / 1024 / 1024).toFixed(2)} MB`,
            averageTtl: `${(this.stats.averageTtl / 60).toFixed(1)} minutes`,
            hitRateHistory: this.getHitRateHistory(5)
        };
    }
    
    setMaxSize(size) {
        this.maxSize = size;
        this.cleanup();
    }
    
    setDefaultTTL(ttl) {
        this.defaultTTL = ttl;
    }
    
    getKeysByPattern(pattern) {
        const regex = new RegExp(pattern);
        return Array.from(this.cache.keys()).filter(key => regex.test(key));
    }
    
    getStatsSummary() {
        return {
            ...this.getStats(),
            oldestKey: this.keyTimestamps.size > 0 ? Math.min(...this.keyTimestamps.values()) : null,
            newestKey: this.keyTimestamps.size > 0 ? Math.max(...this.keyTimestamps.values()) : null,
            averageHitRate: this.hitRateHistory.reduce((sum, h) => sum + h.hitRate, 0) / (this.hitRateHistory.length || 1)
        };
    }
}

module.exports = SuperCache;