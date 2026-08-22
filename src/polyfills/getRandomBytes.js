/**
 * Pure-JS crypto.getRandomValues polyfill for Hermes / React Native.
 * Uses the Web Crypto API if available (Hermes 1084+), otherwise falls back
 * to a seed-based XorShift PRNG with periodic reseeding from performance.now().
 *
 * For XRPL key generation you need real entropy. On a device where Hermes
 * does NOT expose crypto.getRandomValues this will work but the seed comes
 * from performance.now() + process.pid.  In production you would swap this
 * for a native module that wraps android.security.KeyStore / SecureRandom.
 */
let pool = new Uint8Array(256);
let poolOffset = pool.length;
function seed(seedValue) {
  // Simple xorshift128+ seeded PRNG
  let s0 = (seedValue >>> 0) ^ 0xDEADBEEF;
  let s1 = Date.now() ^ performance.now();
  const next = () => {
    let x = s0, y = s1;
    s0 = y;
    x ^= (x << 13);
    x ^= (x >>> 17);
    x ^= y;
    x ^= (y >>> 4);
    s1 = x;
    return (s0 + s1) | 0;
  };
  for (let i = 0; i < pool.length; i++) {
    pool[i] = next() & 0xFF;
  }
  poolOffset = 0;
}

function fillArray(arr) {
  const len = arr.byteLength;
  // Re-seed every pool drain for extra entropy
  if (poolOffset + len > pool.length) {
    seed(
      performance.now() * 1000 ^
      process?.versions?.uv ? process.versions.uv.charCodeAt(0) : 0
    );
  }
  for (let i = 0; i < len; i++) {
    arr[i] = pool[poolOffset + i];
  }
  poolOffset += Math.ceil(len / pool.length) * pool.length;
  return arr;
}

export function getRandomValues(arr) {
  seed(Date.now() ^ performance.now());
  if (typeof TextEncoder !== 'undefined') {
    // extra entropy from string operations
    const enc = new TextEncoder();
    const chunk = enc.encode(String(Math.random(), Date.now()));
    for (let i = 0; i < Math.min(chunk.length, poolOffset + arr.byteLength); i++) {
      pool[poolOffset + i] ^= chunk[i];
    }
  }
  return fillArray(arr);
}

// Initialise global.crypto if not present
if (!(global.crypto)) {
  global.crypto = {};
}
if (typeof global.crypto.getRandomValues !== 'function') {
  global.crypto.getRandomValues = getRandomValues;
}
