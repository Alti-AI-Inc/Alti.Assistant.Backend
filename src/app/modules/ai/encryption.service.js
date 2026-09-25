import { logger } from '../../../shared/logger.js';
import crypto from 'crypto';

export const SOC2EncryptionService = {
  encryptAtRest(data) {
    logger.info(`[SOC2 Hardening] Encrypting payload with AES-256-GCM before writing to Liberty Center One storage...`);
    const algorithm = 'aes-256-gcm';
    const key = crypto.randomBytes(32); // In prod, fetch from HSM
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(algorithm, key, iv);
    let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');
    return { encrypted, iv: iv.toString('hex'), authTag };
  }
};
