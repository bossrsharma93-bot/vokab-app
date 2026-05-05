const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');

class BlockchainRecorder {
    constructor() {
        this.ready = false;
        this.records = [];
        this.chain = [];
        this.stats = { totalRecords: 0, verifiedCount: 0, totalSize: 0 };
        this.pendingRecords = [];
        this.verificationCache = new Map();
    }
    
    async initialize() {
        await new Promise(resolve => setTimeout(resolve, 300));
        this.ready = true;
        console.log('💎 Advanced Blockchain Recorder initialized (PRO)');
        this.createGenesisBlock();
    }
    
    isReady() { return this.ready; }
    
    createGenesisBlock() {
        const genesisBlock = {
            index: 0,
            timestamp: Date.now(),
            data: "Genesis Block - LangBridge Blockchain",
            previousHash: "0",
            hash: this.generateHash("0" + Date.now() + "Genesis Block - LangBridge Blockchain"),
            nonce: 0,
            difficulty: 2
        };
        this.chain.push(genesisBlock);
    }
    
    async record(videoBuffer, metadata = {}, options = {}) {
        const startTime = Date.now();
        const { blockchain = true, encryption = true, difficulty = 2 } = options;
        
        const txId = uuidv4();
        const timestamp = Date.now();
        
        const videoHash = this.generateHash(videoBuffer.toString());
        
        let encryptedVideo = videoBuffer;
        let encryptionKey = null;
        let encryptionIv = null;
        let encryptionAuthTag = null;
        
        if (encryption) {
            const encrypted = await this.encryptVideo(videoBuffer);
            encryptedVideo = encrypted.data;
            encryptionKey = encrypted.key;
            encryptionIv = encrypted.iv;
            encryptionAuthTag = encrypted.authTag;
        }
        
        const record = {
            txId,
            videoHash,
            timestamp,
            size: videoBuffer.length,
            metadata: {
                ...metadata,
                encryption: encryption,
                recordType: 'video_call',
                version: '2.0'
            },
            verified: true,
            blockchain: blockchain ? await this.addToBlockchain(txId, videoHash, metadata, difficulty) : null
        };
        
        if (encryptionKey) {
            record.encryptionKey = encryptionKey;
            record.encryptionIv = encryptionIv;
            record.encryptionAuthTag = encryptionAuthTag;
        }
        
        this.records.push(record);
        this.stats.totalRecords++;
        this.stats.totalSize += videoBuffer.length;
        
        const processingTime = Date.now() - startTime;
        
        return {
            success: true,
            txId,
            blockHash: record.blockchain?.hash || null,
            blockIndex: record.blockchain?.index || null,
            timestamp,
            verificationHash: record.videoHash,
            processingTime,
            size: videoBuffer.length,
            encrypted: encryption,
            message: "Recording stored on blockchain",
            confirmations: 1
        };
    }
    
    async addToBlockchain(txId, videoHash, metadata, difficulty = 2) {
        const previousBlock = this.chain[this.chain.length - 1];
        const index = this.chain.length;
        const timestamp = Date.now();
        
        let nonce = 0;
        let hash = "";
        const target = "0".repeat(difficulty);
        
        do {
            nonce++;
            hash = this.generateHash(index + timestamp + JSON.stringify(metadata) + previousBlock.hash + nonce + txId);
        } while (hash.substring(0, difficulty) !== target);
        
        const block = {
            index,
            timestamp,
            data: { txId, videoHash, metadata },
            previousHash: previousBlock.hash,
            hash,
            nonce,
            difficulty
        };
        
        this.chain.push(block);
        return block;
    }
    
    generateHash(data) {
        return crypto.createHash('sha256').update(data.toString()).digest('hex');
    }
    
    async encryptVideo(videoBuffer) {
        const algorithm = 'aes-256-gcm';
        const key = crypto.randomBytes(32);
        const iv = crypto.randomBytes(16);
        
        const cipher = crypto.createCipheriv(algorithm, key, iv);
        let encrypted = cipher.update(videoBuffer);
        encrypted = Buffer.concat([encrypted, cipher.final()]);
        const authTag = cipher.getAuthTag();
        
        return {
            data: encrypted,
            key: key.toString('hex'),
            iv: iv.toString('hex'),
            authTag: authTag.toString('hex')
        };
    }
    
    async decryptVideo(encryptedData, keyHex, ivHex, authTagHex) {
        const algorithm = 'aes-256-gcm';
        const key = Buffer.from(keyHex, 'hex');
        const iv = Buffer.from(ivHex, 'hex');
        const authTag = Buffer.from(authTagHex, 'hex');
        
        const decipher = crypto.createDecipheriv(algorithm, key, iv);
        decipher.setAuthTag(authTag);
        
        let decrypted = decipher.update(encryptedData);
        decrypted = Buffer.concat([decrypted, decipher.final()]);
        
        return decrypted;
    }
    
    async verify(txId) {
        if (this.verificationCache.has(txId)) {
            return this.verificationCache.get(txId);
        }
        
        const record = this.records.find(r => r.txId === txId);
        if (!record) {
            return { verified: false, error: "Record not found" };
        }
        
        let blockchainValid = true;
        let confirmations = 0;
        
        if (record.blockchain) {
            const block = this.chain.find(b => b.index === record.blockchain.index);
            if (block && block.hash === record.blockchain.hash) {
                confirmations = this.chain.length - block.index;
                blockchainValid = true;
            } else {
                blockchainValid = false;
            }
        }
        
        this.stats.verifiedCount++;
        
        const result = {
            verified: true,
            record: {
                txId: record.txId,
                timestamp: record.timestamp,
                size: record.size,
                metadata: record.metadata
            },
            blockchain: record.blockchain ? {
                blockIndex: record.blockchain.index,
                blockHash: record.blockchain.hash,
                confirmations,
                valid: blockchainValid
            } : null,
            verificationTime: Date.now()
        };
        
        this.verificationCache.set(txId, result);
        setTimeout(() => this.verificationCache.delete(txId), 3600000);
        
        return result;
    }
    
    async getRecord(txId) {
        const record = this.records.find(r => r.txId === txId);
        if (!record) return null;
        return record;
    }
    
    async getAllRecords(options = {}) {
        const { limit = 50, offset = 0, sortBy = 'timestamp', order = 'desc' } = options;
        const records = [...this.records]
            .sort((a, b) => order === 'desc' ? b[sortBy] - a[sortBy] : a[sortBy] - b[sortBy])
            .slice(offset, offset + limit)
            .map(r => ({
                txId: r.txId,
                timestamp: r.timestamp,
                size: r.size,
                verified: r.verified,
                hasBlockchain: !!r.blockchain
            }));
        
        return {
            records,
            total: this.records.length,
            totalSize: this.stats.totalSize,
            limit,
            offset,
            sortBy,
            order
        };
    }
    
    getChain() {
        return this.chain.map(block => ({
            index: block.index,
            hash: block.hash,
            previousHash: block.previousHash,
            timestamp: block.timestamp,
            nonce: block.nonce,
            difficulty: block.difficulty
        }));
    }
    
    validateChain() {
        for (let i = 1; i < this.chain.length; i++) {
            const currentBlock = this.chain[i];
            const previousBlock = this.chain[i - 1];
            
            if (currentBlock.previousHash !== previousBlock.hash) {
                return { valid: false, error: `Block ${i} has invalid previous hash`, blockIndex: i };
            }
            
            const target = "0".repeat(currentBlock.difficulty);
            if (currentBlock.hash.substring(0, currentBlock.difficulty) !== target) {
                return { valid: false, error: `Block ${i} has invalid proof of work`, blockIndex: i };
            }
            
            const computedHash = this.generateHash(
                currentBlock.index + currentBlock.timestamp + 
                JSON.stringify(currentBlock.data) + currentBlock.previousHash + 
                currentBlock.nonce + currentBlock.data.txId
            );
            
            if (currentBlock.hash !== computedHash) {
                return { valid: false, error: `Block ${i} has invalid hash`, blockIndex: i };
            }
        }
        
        return { valid: true };
    }
    
    getStats() {
        const chainValid = this.validateChain();
        return {
            ...this.stats,
            ready: this.ready,
            chainLength: this.chain.length,
            pendingRecords: this.pendingRecords.length,
            chainValid: chainValid.valid,
            chainError: chainValid.error,
            cacheSize: this.verificationCache.size,
            averageRecordSize: this.stats.totalRecords > 0 ? this.stats.totalSize / this.stats.totalRecords : 0
        };
    }
    
    clearCache() {
        this.verificationCache.clear();
        return { success: true, cleared: this.verificationCache.size };
    }
}

module.exports = BlockchainRecorder;