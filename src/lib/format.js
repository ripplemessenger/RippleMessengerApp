/**
 * format — shared time / address formatting helpers.
 *
 * Before this module existed, each screen had its own copy of time and
 * address formatting (BulletinCard, SessionListItem, BulletinManagementTab,
 * ChatDetailScreen, BulletinDetailScreen), so the same timestamp/address
 * rendered differently depending on the page. All formatting now lives here.
 */

/**
 * Relative time — "just now / X min ago / X hours ago / X days ago / date".
 * Used by bulletin cards and detail headers.
 * @param {function} t - i18n translate function
 * @param {number} ms - epoch milliseconds
 */
export function formatRelative(t, ms) {
 if (!ms) return "";
 const now = Date.now();
 const diff = now - ms;
 const sec = Math.floor(diff / 1000);
 if (sec < 60) return t("time.just_now");
 const min = Math.floor(sec / 60);
 if (min < 60) return t("time.m_ago", { count: min });
 const hr = Math.floor(min / 60);
 if (hr < 24) return t("time.h_ago", { count: hr });
 const days = Math.floor(hr / 24);
 if (days < 7) return t("time.d_ago", { count: days });
 return new Date(ms).toLocaleDateString();
}

/**
 * Chat-style time — "HH:mm / Yesterday / weekday / M-D".
 * Used by the session list and chat message bubbles.
 * @param {function} t - i18n translate function
 * @param {number} timestamp - epoch milliseconds
 */
export function formatChatTime(t, timestamp) {
 if (!timestamp || typeof timestamp !== "number" || timestamp <= 0) return "";
 const now = Date.now();
 const diff = now - timestamp;

 // Within today: show time HH:mm
 if (diff < 24 * 60 * 60 * 1000) {
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
 }

 // Yesterday
 if (diff < 48 * 60 * 60 * 1000) {
  return t("time.yesterday", { defaultValue: "Yesterday" });
 }

 // Within a week: day name
 if (diff < 7 * 24 * 60 * 60 * 1000) {
  const date = new Date(timestamp);
  return date.toLocaleDateString([], { weekday: "short" });
 }

 // Older: full date
 const date = new Date(timestamp);
 return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

/**
 * Absolute time — "MM-DD HH:mm" (year added when not the current year).
 * Used by management screens.
 * @param {number} ts - epoch milliseconds
 */
export function formatAbsolute(ts) {
 if (!ts) return "-";
 const d = new Date(ts);
 const y = d.getFullYear();
 const now = new Date().getFullYear();
 const pad = (n) => (n < 10 ? "0" + n : String(n));
 if (y !== now) {
  return `${y}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
 }
 return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Unified time format:
 *   Today:        "HH:mm"
 *   This year:    "MM-DD HH:mm"
 *   Other year:   "YYYY-MM-DD HH:mm"
 * @param {number} ts - epoch milliseconds
 */
export function formatTime(ts) {
 if (!ts) return "-";
 const d = new Date(ts);
 const now = new Date();
 const pad = (n) => (n < 10 ? "0" + n : String(n));
 const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
 const md = `${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
 const y = d.getFullYear();
 if (
  y === now.getFullYear() &&
  d.getMonth() === now.getMonth() &&
  d.getDate() === now.getDate()
 ) {
  return hm;
 }
 if (y === now.getFullYear()) {
  return `${md} ${hm}`;
 }
 return `${y}-${md} ${hm}`;
}

/**
 * Truncate an XRPL address to a short readable form: first 6 + "..." + last 4.
 * Single canonical rule for the whole app.
 * @param {string} addr - XRPL address
 */
export function shortenAddress(addr) {
 if (!addr || addr.length < 14) return addr || "";
 return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

/**
 * Truncate a string to a max length and append ellipsis.
 * @param {string} text
 * @param {number} maxLength
 */
export function truncate(text, maxLength = 40) {
 if (!text) return "";
 if (text.length <= maxLength) return text;
 return text.substring(0, maxLength).trimEnd() + "…";
}

/**
 * Format file size in bytes to a human-readable string ("1.2 KB").
 * @param {number} bytes
 */
export function formatFileSize(bytes) {
 if (!bytes || bytes <= 0) return "";
 if (bytes < 1024) return `${bytes} B`;
 if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
 return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
