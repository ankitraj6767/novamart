import { Injectable, Logger } from '@nestjs/common';
import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import { loadServerEnv } from '@novamart/config';
import { AppError } from '../errors/app-error';

/**
 * Application-level encryption for sensitive columns.
 *
 * Used for seller bank account numbers and KYC document numbers — values NovaMart must be
 * able to read back (to pay a seller, to show an operator the last four digits) but must
 * never store in the clear.
 *
 * Design notes, each deliberate:
 *
 *  - AES-256-GCM: authenticated, so tampering with stored ciphertext is detected rather
 *    than silently decrypting to garbage.
 *  - Encryption happens here, not in pgcrypto, so the key never travels as a query
 *    parameter where a slow-query log or statement sample could capture it.
 *  - A random IV per value. Reusing an IV under GCM is catastrophic — it leaks the XOR of
 *    plaintexts and breaks authentication — so it is never derived from the data.
 *  - The stored envelope carries a key version, so a rotation can decrypt old rows with
 *    the previous key while writing new ones with the current one.
 *  - A separate blind index (HMAC) supports "is this account already registered?" without
 *    decrypting every row. It is an HMAC, not a plain hash, so an attacker with the
 *    database but not the key cannot brute-force short account numbers.
 *
 * Envelope layout: v<version>:<iv-b64>:<authTag-b64>:<ciphertext-b64>
 */
@Injectable()
export class FieldEncryptionService {
  private readonly logger = new Logger(FieldEncryptionService.name);
  private readonly env = loadServerEnv();
  private readonly key: Buffer | null;
  private readonly hmacKey: Buffer | null;
  private readonly version: number;

  constructor() {
    this.version = this.env.FIELD_ENCRYPTION_KEY_VERSION;

    if (!this.env.FIELD_ENCRYPTION_KEY) {
      // loadServerEnv refuses this in production, so we can only be in a lower
      // environment. Fail at use rather than at boot so unrelated local work is not
      // blocked by a key nobody needs yet.
      this.key = null;
      this.hmacKey = null;
      this.logger.warn(
        'FIELD_ENCRYPTION_KEY is not set; storing bank or KYC numbers will be refused',
      );
      return;
    }

    const raw = Buffer.from(this.env.FIELD_ENCRYPTION_KEY, 'base64');
    if (raw.length !== 32) {
      throw new Error(
        `FIELD_ENCRYPTION_KEY must decode to exactly 32 bytes, got ${raw.length}. ` +
          'Generate one with: openssl rand -base64 32',
      );
    }

    this.key = raw;
    // Derived, not reused: using the same key material for both encryption and the blind
    // index would let a chosen-plaintext attack on one weaken the other.
    this.hmacKey = createHmac('sha256', raw).update('novamart:blind-index:v1').digest();
  }

  get available(): boolean {
    return this.key !== null;
  }

  encrypt(plaintext: string): Buffer {
    const key = this.requireKey();

    const iv = randomBytes(12); // 96 bits, the size GCM is specified for.
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();

    const envelope = [
      `v${this.version}`,
      iv.toString('base64'),
      authTag.toString('base64'),
      ciphertext.toString('base64'),
    ].join(':');

    // Stored as bytea: the column type is binary, and keeping the envelope opaque
    // discourages anyone from trying to parse it in SQL.
    return Buffer.from(envelope, 'utf8');
  }

  decrypt(stored: Buffer | Uint8Array): string {
    const key = this.requireKey();

    const envelope = Buffer.from(stored).toString('utf8');
    const parts = envelope.split(':');
    if (parts.length !== 4 || !parts[0]?.startsWith('v')) {
      throw new AppError('INTERNAL_ERROR', 'Stored ciphertext is not a recognised envelope');
    }

    const [versionTag, ivB64, tagB64, dataB64] = parts as [string, string, string, string];
    const version = Number(versionTag.slice(1));
    if (version !== this.version) {
      // A real rotation would look up the historical key here. Failing loudly is correct
      // until that exists: silently returning nothing would look like missing data.
      throw new AppError(
        'INTERNAL_ERROR',
        `Ciphertext was written with key version ${version}, current is ${this.version}`,
      );
    }

    try {
      const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'));
      decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
      return Buffer.concat([
        decipher.update(Buffer.from(dataB64, 'base64')),
        decipher.final(),
      ]).toString('utf8');
    } catch {
      // GCM authentication failed: the row was altered, or the key is wrong.
      throw new AppError('INTERNAL_ERROR', 'Stored value failed authentication');
    }
  }

  /**
   * Deterministic blind index for equality lookups.
   *
   * Lets "has this bank account already been registered by another seller?" be answered
   * with an indexed comparison, without decrypting anything.
   */
  blindIndex(plaintext: string): string {
    if (!this.hmacKey) this.requireKey();
    return createHmac('sha256', this.hmacKey!).update(plaintext.trim()).digest('hex');
  }

  /** Constant-time comparison of two blind indexes. */
  blindIndexMatches(a: string, b: string): boolean {
    const bufA = Buffer.from(a, 'hex');
    const bufB = Buffer.from(b, 'hex');
    return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
  }

  /** Last four digits, which are safe to display and to store alongside. */
  last4(value: string): string {
    const digits = value.replace(/\D/g, '');
    return digits.slice(-4).padStart(4, '0');
  }

  private requireKey(): Buffer {
    if (!this.key) {
      throw new AppError(
        'INTERNAL_ERROR',
        'Field encryption is not configured; set FIELD_ENCRYPTION_KEY',
      );
    }
    return this.key;
  }
}
