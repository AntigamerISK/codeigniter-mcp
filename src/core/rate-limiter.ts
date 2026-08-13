/**
 * In-memory token bucket that rate-limits heavy write operations.
 *
 * Contract (spec section 1, `rate-limiter.ts`):
 * - Max `capacity` operations per minute per session.
 * - Throws `RateLimitExceededError` when the limit is exceeded.
 * - The clock is injectable for deterministic tests.
 */

import { RateLimitExceededError } from "./errors.js";

export class RateLimiter {
  private tokens: number;
  private lastRefill: number;

  /**
   * @param capacity Max tokens available per 60s window.
   * @param clock    Function returning current ms (injectable in tests).
   */
  constructor(
    private readonly capacity: number,
    private readonly clock: () => number = Date.now,
  ) {
    if (!Number.isFinite(capacity) || capacity <= 0) {
      throw new Error(`Invalid capacity for RateLimiter: ${capacity}`);
    }
    this.tokens = capacity;
    this.lastRefill = clock();
  }

  /**
   * Consumes one token. Throws `RateLimitExceededError` when none are left.
   */
  consume(): void {
    this.refill();
    if (this.tokens < 1) {
      throw new RateLimitExceededError(
        "Per-minute operation limit exceeded. Wait and retry.",
      );
    }
    this.tokens -= 1;
  }

  /** Tokens currently available (useful for tests/diagnostics). */
  get available(): number {
    this.refill();
    return this.tokens;
  }

  /** Resets the bucket (tests only). */
  reset(): void {
    this.tokens = this.capacity;
    this.lastRefill = this.clock();
  }

  private refill(): void {
    const now = this.clock();
    const elapsed = now - this.lastRefill;
    if (elapsed > 0) {
      const refill = (elapsed / 60_000) * this.capacity;
      this.tokens = Math.min(this.capacity, this.tokens + refill);
      this.lastRefill = now;
    }
  }
}
