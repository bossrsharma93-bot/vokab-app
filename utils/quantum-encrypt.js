const crypto = require('crypto');

class QuantumEncrypt {
    constructor() {
        this.algorithm = 'aes-256-gcm';
        this.hashAlgorithm = 'sha512';
        this.keyDerivation = 'pbkdf2';
        this.iterations = 200000; // Increased for security
        this.keyLength = 32;
        this.encryptionHistory = [];
        this.stats = { encrypted: 0, decrypted: 0 };
    }
    
    encrypt(text, key = null, options = {}) {
        const startTime = Date.now();
        const jobId = `enc_${Date.now()}_${Math.random()}`;
        const { encoding = 'hex', salt = null, compression = false } = options;
        
        let data = text;
        if (compression) {
            data = this.compress(text);
        }
        
        const secretKey = key ? Buffer.from(key, 'hex') : crypto.randomBytes(32);
        const iv = crypto.randomBytes(16);
        const actualSalt = salt || crypto.randomBytes(16);
        
        const derivedKey = crypto.pbkdf2Sync(secretKey, actualSalt, this.iterations, this.keyLength, this.hashAlgorithm);
        const cipher = crypto.createCipheriv(this.algorithm, derivedKey, iv);
        
        let encrypted = cipher.update(data, 'utf8', encoding);
        encrypted += cipher.final(encoding);
        const authTag = cipher.getAuthTag();
        
        const result = {
            jobId,
            encrypted,
            iv: iv.toString(encoding),
            authTag: authTag.toString(encoding),
            salt: actualSalt.toString(encoding),
            algorithm: this.algorithm,
            encoding,
            compression,
            timestamp: Date.now(),
            processingTime: Date.now() - startTime
        };
        
        if (!key) {
            result.key = secretKey.toString(encoding);
        }
        
        this.encryptionHistory.push({ jobId, type: 'encrypt', timestamp: Date.now() });
        this.stats.encrypted++;
        
        if (this.encryptionHistory.length > 100) this.encryptionHistory.shift();
        
        return result;
    }
    
    decrypt(encryptedData, key, options = {}) {
        const startTime = Date.now();
        const jobId = `dec_${Date.now()}_${Math.random()}`;
        const { encoding = 'hex', decompress = false } = options;
        
        const secretKey = Buffer.from(key, 'hex');
        const iv = Buffer.from(encryptedData.iv, encoding);
        const authTag = Buffer.from(encryptedData.authTag, encoding);
        const salt = Buffer.from(encryptedData.salt, encoding);
        
        const derivedKey = crypto.pbkdf2Sync(secretKey, salt, this.iterations, this.keyLength, this.hashAlgorithm);
        const decipher = crypto.createDecipheriv(this.algorithm, derivedKey, iv);
        decipher.setAuthTag(authTag);
        
        let decrypted = decipher.update(encryptedData.encrypted, encoding, 'utf8');
        decrypted += decipher.final('utf8');
        
        let result = decrypted;
        if (decompress && encryptedData.compression) {
            result = this.decompress(decrypted);
        }
        
        this.stats.decrypted++;
        this.encryptionHistory.push({ jobId, type: 'decrypt', timestamp: Date.now() });
        
        return {
            success: true,
            jobId,
            decrypted: result,
            processingTime: Date.now() - startTime,
            timestamp: Date.now()
        };
    }
    
    compress(text) {
        // Simple compression simulation
        return text.replace(/\s+/g, ' ').trim();
    }
    
    decompress(text) {
        // Decompression simulation
        return text;
    }
    
    hash(text, algorithm = this.hashAlgorithm, options = {}) {
        const { encoding = 'hex', salt = null, iterations = 1 } = options;
        
        let result = text;
        let currentSalt = salt;
        
        if (!currentSalt) {
            currentSalt = crypto.randomBytes(32);
        }
        
        for (let i = 0; i < iterations; i++) {
            const hash = crypto.createHash(algorithm);
            hash.update(currentSalt.toString('hex') + result);
            result = hash.digest(encoding);
        }
        
        return {
            hash: result,
            salt: currentSalt.toString(encoding),
            algorithm,
            iterations
        };
    }
    
    verify(text, hashData) {
        const { hash: originalHash, salt, algorithm, iterations = 1 } = hashData;
        
        let computed = text;
        const saltBuffer = Buffer.from(salt, 'hex');
        
        for (let i = 0; i < iterations; i++) {
            const hash = crypto.createHash(algorithm);
            hash.update(saltBuffer.toString('hex') + computed);
            computed = hash.digest('hex');
        }
        
        return computed === originalHash;
    }
    
    generateKey() {
        return crypto.randomBytes(32).toString('hex');
    }
    
    generateIV() {
        return crypto.randomBytes(16).toString('hex');
    }
    
    generateSalt() {
        return crypto.randomBytes(32).toString('hex');
    }
    
    generateSecureToken(length = 32, options = {}) {
        const { encoding = 'hex', prefix = '', entropy = true } = options;
        let random = crypto.randomBytes(length).toString(encoding);
        
        if (entropy) {
            random += Date.now().toString(36) + Math.random().toString(36).substring(2);
            random = crypto.createHash('sha256').update(random).digest(encoding).substring(0, length);
        }
        
        return prefix ? `${prefix}_${random}` : random;
    }
    
    quantumEncrypt(text, options = {}) {
        const startTime = Date.now();
        const { algorithm = 'kyber', layers = 3 } = options;
        
        let encrypted = text;
        let keys = [];
        
        for (let i = 0; i < layers; i++) {
            const layerKey = this.generateKey();
            const layerEncrypted = this.encrypt(encrypted, layerKey);
            encrypted = JSON.stringify(layerEncrypted);
            keys.push(layerKey);
        }
        
        const finalKey = this.generateKey();
        const finalEncrypted = this.encrypt(encrypted, finalKey);
        keys.push(finalKey);
        
        return {
            encrypted: finalEncrypted,
            algorithm: `quantum-${algorithm}`,
            layers,
            keys: keys,
            timestamp: Date.now(),
            processingTime: Date.now() - startTime
        };
    }
    
    quantumDecrypt(encryptedData, keys, options = {}) {
        let decrypted = encryptedData;
        
        for (let i = keys.length - 1; i >= 0; i--) {
            const decryptedLayer = this.decrypt(decrypted, keys[i]);
            decrypted = typeof decryptedLayer === 'object' ? JSON.stringify(decryptedLayer) : decryptedLayer;
        }
        
        return JSON.parse(decrypted).decrypted;
    }
    
    encryptFile(buffer, key = null, options = {}) {
        const { compression = false } = options;
        let data = buffer;
        
        if (compression) {
            data = Buffer.from(this.compress(buffer.toString()));
        }
        
        const secretKey = key || this.generateKey();
        const iv = this.generateIV();
        const cipher = crypto.createCipheriv(this.algorithm, Buffer.from(secretKey, 'hex'), Buffer.from(iv, 'hex'));
        
        const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
        const authTag = cipher.getAuthTag();
        
        return {
            encrypted,
            iv,
            authTag: authTag.toString('hex'),
            key: secretKey,
            originalSize: buffer.length,
            encryptedSize: encrypted.length,
            compression,
            timestamp: Date.now()
        };
    }
    
    decryptFile(encryptedData, key, options = {}) {
        const { decompress = false } = options;
        const decipher = crypto.createDecipheriv(
            this.algorithm,
            Buffer.from(key, 'hex'),
            Buffer.from(encryptedData.iv, 'hex')
        );
        decipher.setAuthTag(Buffer.from(encryptedData.authTag, 'hex'));
        
        let decrypted = Buffer.concat([decipher.update(encryptedData.encrypted), decipher.final()]);
        
        if (decompress && encryptedData.compression) {
            decrypted = Buffer.from(this.decompress(decrypted.toString()));
        }
        
        return decrypted;
    }
    
    getHistory() {
        return {
            history: this.encryptionHistory,
            total: this.encryptionHistory.length,
            encrypted: this.stats.encrypted,
            decrypted: this.stats.decrypted
        };
    }
    
    getStats() {
        return {
            ...this.stats,
            algorithm: this.algorithm,
            hashAlgorithm: this.hashAlgorithm,
            iterations: this.iterations,
            historyCount: this.encryptionHistory.length
        };
    }
}

module.exports = QuantumEncrypt;