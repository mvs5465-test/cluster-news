import assert from "node:assert/strict";
import test from "node:test";
import { ActionLimiter } from "@/lib/action-limiter";

test("ActionLimiter enforces its concurrency ceiling", () => {
  const limiter = new ActionLimiter(2);

  const first = limiter.tryAcquire();
  const second = limiter.tryAcquire();
  const third = limiter.tryAcquire();

  assert.ok(first);
  assert.ok(second);
  assert.equal(third, null);
  assert.equal(limiter.getActiveCount(), 2);
});

test("ActionLimiter releases capacity exactly once", () => {
  const limiter = new ActionLimiter(1);

  const lease = limiter.tryAcquire();
  assert.ok(lease);
  assert.equal(limiter.tryAcquire(), null);

  lease.release();
  lease.release();

  assert.equal(limiter.getActiveCount(), 0);
  assert.ok(limiter.tryAcquire());
});
