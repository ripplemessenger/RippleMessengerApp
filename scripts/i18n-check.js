#!/usr/bin/env node
/**
 * i18n key completeness check.
 *
 * Scans src/ for every t("...") / t('...') key used in code, then verifies
 * each key exists in every locale file under src/i18n/locales/. i18next
 * silently echoes the raw key when a translation is missing (no error, no
 * crash), so missing keys only show up as bare "section.key" strings in the
 * UI. This check catches that before it ships.
 *
 * Usage:  npm run i18n-check
 * Exits 1 if any key is missing from any locale, 0 when clean.
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const SRC = path.join(ROOT, "src");
const LOCALES_DIR = path.join(SRC, "i18n", "locales");

const CODE_EXT = new Set([".jsx", ".js", ".ts", ".tsx"]);
const SKIP_DIR = new Set(["node_modules", "tmp", "test", "android"]);

// t("a.b.c") / t('a.b.c') — only literal dotted keys (dynamic keys can't be checked)
const KEY_RE = /\bt\(\s*["']([A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)+)["']/g;

function walk(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIR.has(entry.name)) walk(path.join(dir, entry.name), out);
    } else if (CODE_EXT.has(path.extname(entry.name))) {
      out.push(path.join(dir, entry.name));
    }
  }
  return out;
}

function collectKeys() {
  const keys = new Set();
  for (const file of walk(SRC, [])) {
    const text = fs.readFileSync(file, "utf8");
    for (const m of text.matchAll(KEY_RE)) keys.add(m[1]);
  }
  return keys;
}

function loadLocales() {
  const locales = {};
  for (const f of fs.readdirSync(LOCALES_DIR)) {
    if (!f.endsWith(".json")) continue;
    const lang = f.slice(0, -5);
    const raw = fs.readFileSync(path.join(LOCALES_DIR, f), "utf8");
    try {
      locales[lang] = JSON.parse(raw);
    } catch (e) {
      console.error(`[i18n-check] FAIL — invalid JSON in ${f}: ${e.message}`);
      process.exit(1);
    }
  }
  return locales;
}

function hasKey(obj, key) {
  let cur = obj;
  for (const part of key.split(".")) {
    if (cur === null || typeof cur !== "object" || !(part in cur)) return false;
    cur = cur[part];
  }
  return true;
}

function main() {
  const keys = collectKeys();
  const locales = loadLocales();
  const langs = Object.keys(locales).sort();

  const missing = [];
  for (const key of [...keys].sort()) {
    const absent = langs.filter((l) => !hasKey(locales[l], key));
    if (absent.length) missing.push({ key, absent });
  }

  console.log(
    `[i18n-check] ${keys.size} keys used in code, ${langs.length} locales`,
  );

  if (missing.length === 0) {
    console.log("[i18n-check] OK — all keys present in every locale");
    process.exit(0);
  }

  console.error(
    `[i18n-check] FAIL — ${missing.length} key(s) missing from some locales:\n`,
  );
  for (const { key, absent } of missing) {
    console.error(`  ${key}\n      missing in: ${absent.join(", ")}`);
  }
  process.exit(1);
}

main();
