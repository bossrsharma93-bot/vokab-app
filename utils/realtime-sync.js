class RealtimeSync {
    constructor() {
        this.syncData = new Map();
        this.rooms = new Map();
        this.stats = {
            totalSyncs: 0,
            activeRooms: 0,
            averageLatency: 0
        };
        this.syncHistory = [];
    }
    
    async sync(roomId, data, options = {}) {
        const startTime = Date.now();
        const { priority = 'normal', broadcast = true, userId = null } = options;
        
        if (!this.syncData.has(roomId)) {
            this.syncData.set(roomId, { 
                clients: new Map(), 
                lastSync: Date.now(),
                data: new Map(),
                priority: 'normal'
            });
        }
        
        const room = this.syncData.get(roomId);
        
        if (userId) {
            room.clients.set(userId, { lastSeen: Date.now(), priority });
        }
        
        if (broadcast) {
            room.data.set(`sync_${Date.now()}`, {
                data,
                timestamp: Date.now(),
                userId,
                priority
            });
            
            // Clean old data (keep last 100)
            if (room.data.size > 100) {
                const firstKey = Array.from(room.data.keys())[0];
                room.data.delete(firstKey);
            }
        }
        
        room.lastSync = Date.now();
        
        const processingTime = Date.now() - startTime;
        
        this.stats.totalSyncs++;
        this.stats.averageLatency = (this.stats.averageLatency + processingTime) / 2;
        
        this.syncHistory.push({
            roomId,
            userId,
            timestamp: Date.now(),
            processingTime,
            priority
        });
        
        if (this.syncHistory.length > 1000) this.syncHistory.shift();
        
        return {
            success: true,
            synced: true,
            timestamp: room.lastSync,
            processingTime,
            roomDataCount: room.data.size,
            clientCount: room.clients.size
        };
    }
    
    getRoomData(roomId, options = {}) {
        const { limit = 50, since = 0, userId = null } = options;
        
        const room = this.syncData.get(roomId);
        if (!room) return { data: [], count: 0 };
        
        let data = Array.from(room.data.entries())
            .filter(([_, item]) => item.timestamp >= since)
            .slice(-limit)
            .map(([key, item]) => ({ key, ...item }));
        
        if (userId) {
            data = data.filter(item => item.userId === userId);
        }
        
        return {
            data,
            count: data.length,
            totalInRoom: room.data.size,
            clients: room.clients.size
        };
    }
    
    getLatency(roomId) {
        const room = this.syncData.get(roomId);
        if (!room) return 0;
        return Date.now() - room.lastSync;
    }
    
    getRoomInfo(roomId) {
        const room = this.syncData.get(roomId);
        if (!room) return null;
        
        return {
            roomId,
            lastSync: room.lastSync,
            latency: Date.now() - room.lastSync,
            clientCount: room.clients.size,
            dataCount: room.data.size,
            clients: Array.from(room.clients.entries()).map(([id, data]) => ({
                userId: id,
                lastSeen: data.lastSeen,
                isActive: Date.now() - data.lastSeen < 30000
            }))
        };
    }
    
    getAllRooms() {
        const rooms = [];
        for (const [roomId, data] of this.syncData) {
            rooms.push({
                roomId,
                clientCount: data.clients.size,
                dataCount: data.data.size,
                lastSync: data.lastSync,
                latency: Date.now() - data.lastSync
            });
        }
        return rooms;
    }
    
    clearRoom(roomId) {
        const deleted = this.syncData.delete(roomId);
        if (deleted) {
            this.stats.activeRooms = this.syncData.size;
        }
        return { success: deleted, roomId };
    }
    
    clearOldData(maxAge = 3600000) { // 1 hour default
        const now = Date.now();
        let cleared = 0;
        
        for (const [roomId, room] of this.syncData) {
            const oldData = Array.from(room.data.entries())
                .filter(([_, item]) => now - item.timestamp > maxAge);
            
            for (const [key] of oldData) {
                room.data.delete(key);
                cleared++;
            }
            
            // Remove inactive clients (30 seconds)
            for (const [userId, client] of room.clients) {
                if (now - client.lastSeen > 30000) {
                    room.clients.delete(userId);
                }
            }
            
            if (room.clients.size === 0 && room.data.size === 0) {
                this.syncData.delete(roomId);
            }
        }
        
        this.stats.activeRooms = this.syncData.size;
        
        return {
            success: true,
            cleared,
            activeRooms: this.stats.activeRooms
        };
    }
    
    async broadcast(roomId, message, options = {}) {
        const { userId = null, priority = 'normal' } = options;
        
        const result = await this.sync(roomId, message, { broadcast: true, userId, priority });
        
        return {
            success: true,
            roomId,
            message,
            recipients: result.clientCount,
            timestamp: Date.now()
        };
    }
    
    getSyncHistory(limit = 50) {
        return {
            history: this.syncHistory.slice(-limit),
            total: this.syncHistory.length,
            averageLatency: this.stats.averageLatency
        };
    }
    
    getStats() {
        return {
            ...this.stats,
            activeRooms: this.syncData.size,
            rooms: Array.from(this.syncData.keys()),
            historyCount: this.syncHistory.length
        };
    }
}

module.exports = RealtimeSync;