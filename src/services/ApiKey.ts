import { createHash, randomBytes } from 'node:crypto';

export function hashApiKey(key: string): string {
  return `sha256:${createHash('sha256').update(key).digest('hex')}`;
}

export function createApiKey(): { key: string; hash: string } {
  const key = randomBytes(32).toString('base64url');
  return { key, hash: hashApiKey(key) };
}
