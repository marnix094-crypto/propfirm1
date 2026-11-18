import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * AES-256-GCM field encryption for secrets at rest (TOTP secrets; PII later).
 * Format: "v1.<iv>.<tag>.<ciphertext>" (base64url). The key comes only from env.
 */
export class FieldCrypto {
  constructor(private readonly key: Buffer) {
    if (key.length !== 32) throw new Error('FIELD_ENCRYPTION_KEY must be 32 bytes (base64)');
  }

  encrypt(plain: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    return [
      'v1',
      iv.toString('base64url'),
      cipher.getAuthTag().toString('base64url'),
      ct.toString('base64url'),
    ].join('.');
  }

  decrypt(value: string): string {
    const [v, iv, tag, ct] = value.split('.');
    if (v !== 'v1' || !iv || !tag || ct === undefined) throw new Error('Unsupported ciphertext');
    const d = createDecipheriv('aes-256-gcm', this.key, Buffer.from(iv, 'base64url'));
    d.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([d.update(Buffer.from(ct, 'base64url')), d.final()]).toString('utf8');
  }
}

export const FIELD_CRYPTO = Symbol('FIELD_CRYPTO');
