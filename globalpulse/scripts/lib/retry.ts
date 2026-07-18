/**
 * Retry with exponential backoff + jitter (Section 7). Used by every external
 * fetch — Yahoo, World Bank, IMF, FRED — so a single flaky request doesn't
 * fail a whole ingestion run.
 */
export async function fetchWithRetry(
  url: string,
  { retries = 3, baseDelayMs = 500 }: { retries?: number; baseDelayMs?: number } = {}
): Promise<any> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      return await res.json();
    } catch (err) {
      if (attempt === retries) throw err;
      const delay = baseDelayMs * 2 ** attempt + Math.random() * 200;
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * Circuit breaker (Section 7): tracks consecutive failures per source and
 * reports when a run should stop early rather than let one broken source
 * take down an entire job.
 */
export class CircuitBreaker {
  private consecutiveFailures = 0;
  constructor(private readonly threshold: number = 5) {}

  recordSuccess() {
    this.consecutiveFailures = 0;
  }

  recordFailure() {
    this.consecutiveFailures++;
  }

  get isOpen(): boolean {
    return this.consecutiveFailures >= this.threshold;
  }
}
