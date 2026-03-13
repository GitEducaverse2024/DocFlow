import { logger } from './logger';

export interface RetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  shouldRetry?: (error: Error) => boolean;
}

const DEFAULT_SHOULD_RETRY = (error: Error): boolean => {
  const msg = error.message.toLowerCase();
  if (
    msg.includes('econnrefused') ||
    msg.includes('timeout') ||
    msg.includes('aborted') ||
    msg.includes('503') ||
    msg.includes('502') ||
    msg.includes('504') ||
    error.name === 'AbortError'
  ) {
    return true;
  }
  return false;
};

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  opts?: RetryOptions
): Promise<T> {
  const maxAttempts = opts?.maxAttempts ?? 3;
  const baseDelayMs = opts?.baseDelayMs ?? 500;
  const maxDelayMs = opts?.maxDelayMs ?? 10000;
  const shouldRetry = opts?.shouldRetry ?? DEFAULT_SHOULD_RETRY;

  let lastError: Error = new Error('No attempts made');

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      if (attempt === maxAttempts || !shouldRetry(lastError)) {
        throw lastError;
      }

      const rawDelay = Math.min(baseDelayMs * Math.pow(2, attempt - 1), maxDelayMs);
      const jitteredDelay = rawDelay * (0.75 + Math.random() * 0.5);

      logger.warn('system', 'Retry attempt', {
        attempt,
        maxAttempts,
        error: lastError.message,
      });

      await sleep(jitteredDelay);
    }
  }

  throw lastError;
}
