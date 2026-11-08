/**
 * Asynchronous semaphore to bound concurrent CPU/memory-intensive password
 * hashing operations (Argon2id and scrypt) in serverless execution contexts.
 */

export class PasswordHasherBusyError extends Error {
  readonly code: string = 'SERVICE_BUSY';
  readonly retryAfterSeconds: number = 2;

  constructor(
    message = 'Password hashing service is busy, please retry later',
    retryAfterSeconds = 2
  ) {
    super(message);
    this.name = 'PasswordHasherBusyError';
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

interface QueuedWaiter {
  resolve: () => void;
  reject: (err: Error) => void;
  timer: NodeJS.Timeout;
}

let activeCount = 0;
const waiterQueue: QueuedWaiter[] = [];

function getDefaultMaxConcurrency(): number {
  const envVal = process.env.SHOTISTRY_MAX_CONCURRENT_HASHES;
  const parsed = envVal ? Number.parseInt(envVal, 10) : NaN;
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 4;
}

function getDefaultTimeout(): number {
  const envVal = process.env.SHOTISTRY_HASH_SEMAPHORE_TIMEOUT_MS;
  const parsed = envVal ? Number.parseInt(envVal, 10) : NaN;
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 2500;
}

/**
 * Acquire a permit, run the hashing function, and release the permit.
 * If the wait time exceeds timeoutMs, throws PasswordHasherBusyError.
 */
export async function withHashSemaphore<T>(
  fn: () => Promise<T>,
  timeoutMs?: number,
  maxConcurrencyOverride?: number
): Promise<T> {
  const effectiveTimeout =
    timeoutMs !== undefined && timeoutMs > 0 ? timeoutMs : getDefaultTimeout();
  const maxConcurrency =
    maxConcurrencyOverride !== undefined && maxConcurrencyOverride > 0
      ? maxConcurrencyOverride
      : getDefaultMaxConcurrency();

  await acquirePermit(effectiveTimeout, maxConcurrency);
  try {
    return await fn();
  } finally {
    releasePermit();
  }
}

function acquirePermit(timeoutMs: number, maxConcurrency: number): Promise<void> {
  if (activeCount < maxConcurrency) {
    activeCount++;
    return Promise.resolve();
  }

  return new Promise<void>((resolve, reject) => {
    const waiter: QueuedWaiter = {
      resolve: () => {
        resolve();
      },
      reject: (err: Error) => {
        reject(err);
      },
      timer: setTimeout(() => {
        const index = waiterQueue.indexOf(waiter);
        if (index !== -1) {
          waiterQueue.splice(index, 1);
        }
        reject(
          new PasswordHasherBusyError(
            'Password hashing service is busy, please retry later',
            2
          )
        );
      }, timeoutMs),
    };

    waiterQueue.push(waiter);
  });
}

function releasePermit(): void {
  if (waiterQueue.length > 0) {
    const nextWaiter = waiterQueue.shift()!;
    clearTimeout(nextWaiter.timer);
    nextWaiter.resolve();
  } else {
    activeCount = Math.max(0, activeCount - 1);
  }
}

/**
 * Resets semaphore state for clean test isolation.
 */
export function resetHashSemaphoreForTests(): void {
  for (const waiter of waiterQueue) {
    clearTimeout(waiter.timer);
  }
  waiterQueue.length = 0;
  activeCount = 0;
}
