import { describe, expect, it } from "vitest";
import { RateLimiter } from "../../src/core/rate-limiter.js";
import { RateLimitExceededError } from "../../src/core/errors.js";

/** Controllable clock for deterministic tests. */
function fakeClock() {
  let now = 0;
  return {
    advance(ms: number): void {
      now += ms;
    },
    clock: (): number => now,
  };
}

describe("RateLimiter (token bucket)", () => {
  it("allows capacity consumptions and blocks the next one", () => {
    const { clock } = fakeClock();
    const limiter = new RateLimiter(3, clock);
    limiter.consume();
    limiter.consume();
    limiter.consume();
    expect(() => limiter.consume()).toThrow(RateLimitExceededError);
  });

  it("refill: tokens are restored over time (60s for 60 tokens)", () => {
    const { advance, clock } = fakeClock();
    const limiter = new RateLimiter(60, clock);
    for (let i = 0; i < 60; i += 1) limiter.consume();
    expect(() => limiter.consume()).toThrow(RateLimitExceededError);

    advance(30_000);
    expect(limiter.available).toBe(30);

    advance(31_000);
    expect(limiter.available).toBe(60); // capacity cap
  });

  it("never exceeds the capacity after refill", () => {
    const { advance, clock } = fakeClock();
    const limiter = new RateLimiter(10, clock);
    limiter.consume();
    advance(3_600_000);
    expect(limiter.available).toBe(10);
  });

  it("reset restores the tokens", () => {
    const { clock } = fakeClock();
    const limiter = new RateLimiter(2, clock);
    limiter.consume();
    limiter.consume();
    expect(limiter.available).toBe(0);
    limiter.reset();
    expect(limiter.available).toBe(2);
  });

  it("validates the capacity on construction", () => {
    expect(() => new RateLimiter(0)).toThrow();
    expect(() => new RateLimiter(-1)).toThrow();
  });
});
