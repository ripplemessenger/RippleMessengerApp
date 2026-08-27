/**
 * theme — centralized color palette for inline RN styles.
 *
 * These are the accent/neutral colors used in inline `color` / `backgroundColor`
 * props (which cannot use the CSS variables in global.css). Keep the accent in
 * one place so a rebrand is a single-line change.
 */

/** Primary accent (gold/amber) — headers, active tabs, icons, FABs. */
export const ACCENT = "#e6b420";

/** Muted star color when a bulletin is NOT marked. */
export const STAR_UNMARKED = "#a89f85";

/** Inactive tab / secondary text. */
export const TEXT_MUTED = "#9a9590";

/** Secondary icon color (search, close, chevrons, unmarked actions). */
export const ICON_MUTED = "#a89f85";

/** Placeholder text color for TextInput. */
export const PLACEHOLDER = "#9a9590";

/** Empty-state icon color. */
export const EMPTY_ICON = "#d4c8a8";

/** Switch "off" track color. */
export const SWITCH_TRACK_OFF = "#d4c8a8";

/** Switch "off" track color (ServerManagement variant). */
export const SWITCH_TRACK_OFF_ALT = "#555";
