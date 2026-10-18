import crypto from 'crypto';

// Plaintext key is shown to the user exactly once, right after creation.
// We only ever store its SHA256 hash — same pattern as password storage,
// so a DB leak doesn't leak usable keys.
export function generateApiKey(): { plaintext: string; hash: string; prefix: string } {
  const raw = crypto.randomBytes(24).toString('hex'); // 48 hex chars
  const plaintext = `krato_${raw}`;
  const hash = crypto.createHash('sha256').update(plaintext).digest('hex');
  const prefix = plaintext.slice(0, 12); // shown in dashboard so user can tell keys apart, e.g. "krato_ab12c"
  return { plaintext, hash, prefix };
}

export function hashApiKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex');
}
