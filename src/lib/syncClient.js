/**
 * LAN Sync Client — connects to Client's HTTP sync server (port 52343)
 * and performs data synchronization (state exchange → incremental pull/push).
 *
 * Protocol:
 *   1. GET /v1/device → list accounts on Client
 *   2. POST /v1/auth → authenticate (challenge-response, both sides sign)
 *   3. GET /v1/account/{addr}/state → get Client's state
 *   4. Compare with local state → determine what to pull/push
 *   5. GET/POST messages, groups, metadata, handshakes, files
 */

import * as rippleKeypairs from "ripple-keypairs";

const SYNC_PORT = 52343;

/**
 * Generate a random hex string of the given byte length.
 * @param {number} bytes - Number of random bytes
 * @returns {string} Uppercase-free hex string (2*bytes chars)
 */
function randomHex(bytes) {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Build base URL from IP address.
 */
function baseUrl(ip) {
  return `http://${ip}:${SYNC_PORT}`;
}

/**
 * Test connectivity to Client's sync server.
 * @param {string} ip - Client's IP address
 * @returns {Promise<{ok: boolean, accounts?: Array, error?: string}>}
 */
export async function testConnection(ip) {
  try {
    const url = `${baseUrl(ip)}/v1/device`;
    const resp = await fetch(url, { method: "GET", timeout: 5000 });
    if (!resp.ok) {
      return { ok: false, error: `HTTP ${resp.status}` };
    }
    const data = await resp.json();
    return { ok: true, accounts: data.accounts || [] };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}

/**
 * Authenticate with the sync server (bidirectional challenge-response).
 *
 * Flow:
 *   1. App signs a random nonce with the account seed → sends {account, nonce, sig}
 *   2. Client verifies sig (proves App holds the seed), then signs nonce2 with the seed
 *   3. App verifies sig2 (proves Client holds the seed — prevents fake server)
 *
 * @param {string} ip - Client's IP address
 * @param {string} address - Account address to authenticate as
 * @param {string} seed - Account seed (used to sign the nonce)
 * @returns {Promise<{ok: boolean, error?: string}>}
 */
export async function authenticate(ip, address, seed) {
  try {
    if (!seed) {
      return { ok: false, error: "no seed" };
    }
    // Get Client's pubkey first (needed to verify Client's signature)
    const deviceResp = await fetch(`${baseUrl(ip)}/v1/device`, {
      method: "GET",
      timeout: 5000,
    });
    if (!deviceResp.ok) {
      return { ok: false, error: `device HTTP ${deviceResp.status}` };
    }
    const deviceData = await deviceResp.json();
    const clientPubkey = deviceData.accounts?.[0]?.pubkey || "";
    if (!clientPubkey) {
      return {
        ok: false,
        error: "client pubkey not available (not logged in?)",
      };
    }

    const keypair = rippleKeypairs.deriveKeypair(seed);
    const nonce = randomHex(16);
    const sig = rippleKeypairs.sign(nonce, keypair.privateKey);

    const url = `${baseUrl(ip)}/v1/auth`;
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ account: address, nonce, sig }),
      timeout: 5000,
    });
    if (!resp.ok) {
      return { ok: false, error: `HTTP ${resp.status}` };
    }
    const data = await resp.json();
    if (!data.ok) {
      return { ok: false, error: data.error || "auth rejected" };
    }
    // Verify Client's signature using Client's pubkey (proves Client holds the seed)
    const valid = rippleKeypairs.verify(data.nonce2, data.sig2, clientPubkey);
    if (!valid) {
      return { ok: false, error: "client signature invalid" };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}

/**
 * Get the state of an account on the Client.
 * @param {string} ip - Client's IP address
 * @param {string} addr - Account address
 * @returns {Promise<{ok: boolean, state?: object, error?: string}>}
 */
export async function getAccountState(ip, addr) {
  try {
    const url = `${baseUrl(ip)}/v1/account/${addr}/state`;
    const resp = await fetch(url, { method: "GET", timeout: 10000 });
    if (!resp.ok) {
      return { ok: false, error: `HTTP ${resp.status}` };
    }
    const data = await resp.json();
    return { ok: true, state: data };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}

/**
 * Pull private messages from Client.
 * @param {string} ip - Client's IP address
 * @param {string} addr - Account address
 * @param {string} peer - Peer address
 * @param {number} afterSeq - Only get messages with sequence > afterSeq
 * @returns {Promise<{ok: boolean, messages?: Array, error?: string}>}
 */
export async function pullPrivateMessages(ip, addr, peer, afterSeq = 0) {
  try {
    const url = `${baseUrl(ip)}/v1/account/${addr}/private/${peer}/messages?after_seq=${afterSeq}`;
    const resp = await fetch(url, { method: "GET", timeout: 30000 });
    if (!resp.ok) {
      return { ok: false, error: `HTTP ${resp.status}` };
    }
    const data = await resp.json();
    return { ok: true, messages: data.messages || [] };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}

/**
 * Push private messages to Client.
 * @param {string} ip - Client's IP address
 * @param {string} addr - Account address
 * @param {string} peer - Peer address
 * @param {Array} messages - Messages to push
 * @returns {Promise<{ok: boolean, error?: string}>}
 */
export async function pushPrivateMessages(ip, addr, peer, messages) {
  try {
    const url = `${baseUrl(ip)}/v1/account/${addr}/private/${peer}/messages`;
    // DB stores json as a string; parse it so JSON.stringify produces an object, not a string literal
    const toPush = messages.map((m) => ({
      ...m,
      json: typeof m.json === "string" ? JSON.parse(m.json) : m.json,
    }));
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: toPush }),
      timeout: 30000,
    });
    if (!resp.ok) {
      return { ok: false, error: `HTTP ${resp.status}` };
    }
    const data = await resp.json().catch(() => ({}));
    return {
      ok: true,
      imported: data.imported,
      skipped: data.skipped,
      errors: data.errors,
    };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}

/**
 * Pull group messages from Client.
 */
export async function pullGroupMessages(ip, addr, groupHash, afterSeq = 0) {
  try {
    const url = `${baseUrl(ip)}/v1/account/${addr}/group/${groupHash}/messages?after_seq=${afterSeq}`;
    const resp = await fetch(url, { method: "GET", timeout: 30000 });
    if (!resp.ok) {
      return { ok: false, error: `HTTP ${resp.status}` };
    }
    const data = await resp.json();
    return { ok: true, messages: data.messages || [] };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}

/**
 * Push group messages to Client.
 */
export async function pushGroupMessages(ip, addr, groupHash, messages) {
  try {
    const url = `${baseUrl(ip)}/v1/account/${addr}/group/${groupHash}/messages`;
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages }),
      timeout: 30000,
    });
    if (!resp.ok) {
      return { ok: false, error: `HTTP ${resp.status}` };
    }
    const data = await resp.json().catch(() => ({}));
    return {
      ok: true,
      imported: data.imported,
      skipped: data.skipped,
      errors: data.errors,
    };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}

/**
 * Pull groups from Client.
 */
export async function pullGroups(ip, addr) {
  try {
    const url = `${baseUrl(ip)}/v1/account/${addr}/groups`;
    const resp = await fetch(url, { method: "GET", timeout: 10000 });
    if (!resp.ok) {
      return { ok: false, error: `HTTP ${resp.status}` };
    }
    const data = await resp.json();
    return { ok: true, groups: data.groups || [] };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}

/**
 * Push groups to Client.
 */
export async function pushGroups(ip, addr, groups) {
  try {
    const url = `${baseUrl(ip)}/v1/account/${addr}/groups`;
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ groups }),
      timeout: 10000,
    });
    if (!resp.ok) {
      return { ok: false, error: `HTTP ${resp.status}` };
    }
    const data = await resp.json().catch(() => ({}));
    return {
      ok: true,
      imported: data.imported,
      skipped: data.skipped,
      errors: data.errors,
    };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}

/**
 * Pull metadata (contacts, friends, follows) from Client.
 */
export async function pullMetadata(ip, addr) {
  try {
    const url = `${baseUrl(ip)}/v1/account/${addr}/metadata`;
    const resp = await fetch(url, { method: "GET", timeout: 10000 });
    if (!resp.ok) {
      return { ok: false, error: `HTTP ${resp.status}` };
    }
    const data = await resp.json();
    return { ok: true, metadata: data };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}

/**
 * Push metadata to Client.
 */
export async function pushMetadata(ip, addr, metadata) {
  try {
    const url = `${baseUrl(ip)}/v1/account/${addr}/metadata`;
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(metadata),
      timeout: 10000,
    });
    if (!resp.ok) {
      return { ok: false, error: `HTTP ${resp.status}` };
    }
    const data = await resp.json().catch(() => ({}));
    return {
      ok: true,
      imported: data.imported,
      skipped: data.skipped,
      errors: data.errors,
    };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}

/**
 * Pull handshakes from Client.
 */
export async function pullHandshakes(ip, addr) {
  try {
    const url = `${baseUrl(ip)}/v1/account/${addr}/handshakes`;
    const resp = await fetch(url, { method: "GET", timeout: 10000 });
    if (!resp.ok) {
      return { ok: false, error: `HTTP ${resp.status}` };
    }
    const data = await resp.json();
    return { ok: true, handshakes: data.handshakes || [] };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}

/**
 * Push handshakes to Client.
 */
export async function pushHandshakes(ip, addr, handshakes) {
  try {
    const url = `${baseUrl(ip)}/v1/account/${addr}/handshakes`;
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ handshakes }),
      timeout: 10000,
    });
    if (!resp.ok) {
      return { ok: false, error: `HTTP ${resp.status}` };
    }
    const data = await resp.json().catch(() => ({}));
    return {
      ok: true,
      imported: data.imported,
      skipped: data.skipped,
      errors: data.errors,
    };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}

/**
 * Pull a file from Client.
 * @param {string} ip - Client's IP address
 * @param {string} addr - Account address
 * @param {string} hash - File hash
 * @returns {Promise<{ok: boolean, data?: ArrayBuffer, error?: string}>}
 */
export async function pullFile(ip, addr, hash) {
  try {
    const url = `${baseUrl(ip)}/v1/account/${addr}/file/${hash}`;
    const resp = await fetch(url, { method: "GET", timeout: 60000 });
    if (!resp.ok) {
      return { ok: false, error: `HTTP ${resp.status}` };
    }
    const data = await resp.arrayBuffer();
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}

/**
 * Push a file to Client.
 */
export async function pushFile(ip, addr, hash, data) {
  try {
    const url = `${baseUrl(ip)}/v1/account/${addr}/file/${hash}`;
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream" },
      body: data,
      timeout: 60000,
    });
    if (!resp.ok) {
      return { ok: false, error: `HTTP ${resp.status}` };
    }
    const data2 = await resp.json().catch(() => ({}));
    return {
      ok: true,
      imported: data2.imported,
      skipped: data2.skipped,
      errors: data2.errors,
    };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}
