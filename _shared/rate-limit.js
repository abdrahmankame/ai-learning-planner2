const buckets = new Map();

export function checkRateLimit(uid, maxPerMinute = 10) {
  const now = Date.now();
  const windowStart = now - 60_000;
  const arr = (buckets.get(uid) || []).filter(t => t > windowStart);
  if (arr.length >= maxPerMinute) return false;
  arr.push(now);
  buckets.set(uid, arr);
  return true;
}