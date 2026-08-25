#!/usr/bin/env node
/**
 * postinstall patch: react-native-image-crop-picker declares
 * WRITE_EXTERNAL_STORAGE with maxSdkVersion=29, which conflicts with the
 * app's maxSdkVersion=32 under AGP 8.9's stricter manifest merger.
 * Bump the library's value to 32 so the two agree.
 *
 * This runs on every `npm install` to keep the patch persistent.
 */
const fs = require("fs");
const path = require("path");

const manifestPath = path.join(
 __dirname,
 "..",
 "node_modules",
 "react-native-image-crop-picker",
 "android",
 "src",
 "main",
 "AndroidManifest.xml",
);

if (!fs.existsSync(manifestPath)) {
 console.log("[patch-crop-picker] manifest not found, skipping");
 process.exit(0);
}

let content = fs.readFileSync(manifestPath, "utf8");
const before = content;
content = content.replace(
 /android:maxSdkVersion="29"/,
 'android:maxSdkVersion="32"',
);

if (content !== before) {
 fs.writeFileSync(manifestPath, content);
 console.log("[patch-crop-picker] patched maxSdkVersion 29 -> 32");
} else {
 console.log("[patch-crop-picker] already patched or pattern not found");
}
