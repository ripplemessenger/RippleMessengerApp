import { marked } from "marked";

/**
 * Safely convert bulletin text to HTML via marked.
 *
 * @param {string} content  Raw bulletin text.
 * @param {number} [maxLen] Optional truncation length (0/undefined = no truncation).
 * @returns {{isMarkdown: true, html: string} | {isMarkdown: false, plainText: string}}
 *   On success returns rendered HTML; on parse failure returns the (truncated)
 *   plain text so the caller can render it without markdown.
 */
export function parseBulletinMarkdown(content, maxLen = 0) {
   const truncate = (s) =>
      maxLen > 0 && s && s.length > maxLen ? s.slice(0, maxLen) + "…" : s;
   try {
      const text = truncate(content) || "(empty)";
      const html = marked.parse(text) || "<p>(empty)</p>";
      return { isMarkdown: true, html };
   } catch (e) {
      console.warn(
         "[markdown] Markdown parse failed, falling back to plain text:",
         e.message,
      );
      return { isMarkdown: false, plainText: truncate(content) || "(empty)" };
   }
}
