import { describe, expect, it } from 'vitest';
import { base32Decode, base32Encode, hotp, otpauthUri, totp, verifyTotp } from './totp.js';
import { FieldCrypto } from './field-crypto.js';
import { randomBytes } from 'node:crypto';

describe('TOTP (RFC 6238 / 4226)', () => {
  const rfcKey = Buffer.from('12345678901234567890');

  it('matches the RFC 4226 HOTP test vectors', () => {
    expect([0n, 1n, 2n, 9n].map((c) => hotp(rfcKey, c))).toEqual([
      '755224',
      '287082',
      '359152',
      '520489',
    ]);
  });

  it('matches the RFC 6238 SHA-1 vector at T=59s (8 digits: 94287082)', () => {
    expect(hotp(rfcKey, 1n, 8)).toBe('94287082');
    expect(totp(base32Encode(rfcKey), 59_000)).toBe('287082');
  });

  it('round-trips base32', () => {
    const b = randomBytes(20);
    expect(base32Decode(base32Encode(b)).equals(b)).toBe(true);
    expect(base32Encode(Buffer.from('foobar'))).toBe('MZXW6YTBOI');
  });

  it('accepts ±1 step drift and rejects replays', () => {
    const secret = base32Encode(rfcKey);
    const now = 1_700_000_000_000;
    const step = verifyTotp(secret, totp(secret, now - 30_000), null, now);
    expect(step).not.toBeNull();
    expect(verifyTotp(secret, totp(secret, now - 30_000), step, now)).toBeNull(); // replay
    expect(verifyTotp(secret, totp(secret, now - 90_000), null, now)).toBeNull(); // too old
    expect(verifyTotp(secret, 'abc123', null, now)).toBeNull();
  });

  it('builds an otpauth URI', () => {
    expect(otpauthUri('BRAND', 'a@b.c', 'ABC')).toBe(
      'otpauth://totp/BRAND%3Aa%40b.c?secret=ABC&issuer=BRAND&algorithm=SHA1&digits=6&period=30',
    );
  });
});

describe('FieldCrypto', () => {
  const c = new FieldCrypto(randomBytes(32));
  it('encrypts with a random IV and decrypts', () => {
    const a = c.encrypt('secret');
    expect(a).not.toBe(c.encrypt('secret'));
    expect(c.decrypt(a)).toBe('secret');
  });
  it('detects tampering', () => {
    const [v, iv, tag, ct] = c.encrypt('secret').split('.');
    const flipped = Buffer.from(ct!, 'base64url');
    flipped[0]! ^= 1;
    expect(() => c.decrypt([v, iv, tag, flipped.toString('base64url')].join('.'))).toThrow();
  });
  it('rejects a wrong key length', () => {
    expect(() => new FieldCrypto(randomBytes(16))).toThrow();
  });
});
