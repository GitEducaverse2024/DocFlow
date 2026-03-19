import crypto from 'crypto';

// ─── Password Hashing (scrypt, built-in Node.js) ───

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(derived, 'hex'));
}

// ─── Session Management (in-memory with TTL) ───

interface SudoSession {
  expiresAt: number;
}

interface LockoutEntry {
  failedAttempts: number;
  lockedUntil: number;
}

const sessions = new Map<string, SudoSession>();
const lockouts = new Map<string, LockoutEntry>();

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 5 * 60 * 1000; // 5 min lockout

export function createSudoSession(durationMinutes: number): string {
  const token = crypto.randomUUID();
  sessions.set(token, {
    expiresAt: Date.now() + durationMinutes * 60 * 1000,
  });
  return token;
}

export function validateSudoSession(token: string | null | undefined): boolean {
  if (!token) return false;
  const session = sessions.get(token);
  if (!session) return false;
  if (Date.now() >= session.expiresAt) {
    sessions.delete(token);
    return false;
  }
  return true;
}

export function getSudoSessionInfo(token: string | null | undefined): { active: boolean; remainingMs: number } {
  if (!token) return { active: false, remainingMs: 0 };
  const session = sessions.get(token);
  if (!session) return { active: false, remainingMs: 0 };
  const remaining = session.expiresAt - Date.now();
  if (remaining <= 0) {
    sessions.delete(token);
    return { active: false, remainingMs: 0 };
  }
  return { active: true, remainingMs: remaining };
}

export function revokeSudoSession(token: string): void {
  sessions.delete(token);
}

// ─── Lockout Management ───

export function checkLockout(clientId: string): { locked: boolean; remainingMs: number } {
  const entry = lockouts.get(clientId);
  if (!entry) return { locked: false, remainingMs: 0 };
  if (Date.now() >= entry.lockedUntil) {
    lockouts.delete(clientId);
    return { locked: false, remainingMs: 0 };
  }
  return { locked: true, remainingMs: entry.lockedUntil - Date.now() };
}

export function recordFailedAttempt(clientId: string): { locked: boolean; attemptsRemaining: number } {
  const entry = lockouts.get(clientId) || { failedAttempts: 0, lockedUntil: 0 };
  entry.failedAttempts += 1;

  if (entry.failedAttempts >= MAX_FAILED_ATTEMPTS) {
    entry.lockedUntil = Date.now() + LOCKOUT_DURATION_MS;
    lockouts.set(clientId, entry);
    return { locked: true, attemptsRemaining: 0 };
  }

  lockouts.set(clientId, entry);
  return { locked: false, attemptsRemaining: MAX_FAILED_ATTEMPTS - entry.failedAttempts };
}

export function clearLockout(clientId: string): void {
  lockouts.delete(clientId);
}
