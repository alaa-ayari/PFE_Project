// Retry an async operation with exponential backoff and jitter.

export interface RetryOptions {
  retries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  onAttemptFail?: (attempt: number, err: unknown) => void;
}

export async function retryAsync<T>(
  fn: () => Promise<T>,
  opts: RetryOptions = {},
): Promise<T> {
  const retries = opts.retries ?? 3;
  const base = opts.baseDelayMs ?? 500;
  const max = opts.maxDelayMs ?? 8000;

  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      opts.onAttemptFail?.(attempt + 1, err);
      if (attempt === retries) break;
      const expo = Math.min(max, base * 2 ** attempt);
      const jitter = Math.random() * expo * 0.3;
      await new Promise((r) => setTimeout(r, expo + jitter));
    }
  }
  throw lastErr;
}
