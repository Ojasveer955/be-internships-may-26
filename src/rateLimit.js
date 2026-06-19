const RATE = Number(process.env.RATE_LIMIT_PER_MIN || 5);
const WINDOW_MS = 60_000;
const fillRatePerMs = RATE / WINDOW_MS;

const buckets = new Map();

export function checkAndConsume(userId, nowMs = Date.now()) {
  const ent = buckets.get(userId) || { tokens: RATE, lastRefill: nowMs };
  
  const elapsed = Math.max(0, nowMs - ent.lastRefill);
  const newTokens = elapsed * fillRatePerMs;
  
  ent.tokens = Math.min(RATE, ent.tokens + newTokens);
  ent.lastRefill = nowMs;

  let ok = false;
  if (ent.tokens >= 1) {
    ent.tokens -= 1;
    ok = true;
  }
  
  buckets.set(userId, ent);
  
  const remaining = Math.floor(ent.tokens);
  
  // Calculate when the next full token will be available if empty
  const msToNextToken = ent.tokens >= 1 ? 0 : (1 - ent.tokens) / fillRatePerMs;
  const resetMs = Math.ceil(nowMs + msToNextToken);
  
  return { ok, remaining, resetMs };
}
