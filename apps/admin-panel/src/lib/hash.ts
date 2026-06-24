import crypto from 'crypto';

export function hashPhone(phone: string): string {
  const normalized = phone.replace(/[^0-9+\-\s()]/g, '').trim();
  return crypto.createHash('sha256').update(normalized).digest('hex');
}
