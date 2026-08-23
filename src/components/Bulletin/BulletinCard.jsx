import React, { useMemo } from "react";
import { View, Text, TouchableOpacity, ScrollView } from "react-native";
import Ionicons from "react-native-vector-icons/Ionicons";
import { useDispatch } from "react-redux";
import { marked } from "marked";
import { RenderHTML } from "react-native-render-html";

import {
  BulletinMarkToggle,
  ShowForwardBulletin,
} from "../../store/sagas/messenger.actions";
import AvatarImage from "../AvatarImage";
import useDarkMode from "../../hooks/useDarkMode";

/**
 * Format a timestamp (ms epoch) into a human-readable relative string.
 */
function formatTimestamp(ms) {
  const now = Date.now();
  const diff = now - ms;
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const days = Math.floor(hr / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(ms).toLocaleDateString();
}

/**
 * Truncate an XRPL address to a short readable form.
 */
function shortenAddress(addr) {
  if (!addr || addr.length < 14) return addr || "";
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

/**
 * Safely convert bulletin content to HTML via marked.
 * Returns { isMarkdown: true, html } on success, { isMarkdown: false, plainText } on failure.
 */
function parseBulletinPreview(content) {
  try {
    const truncated =
      content.length > 256 ? content.slice(0, 256) + "…" : content;
    const html = marked.parse(truncated || "(empty)") || "<p>(empty)</p>";
    return { isMarkdown: true, html };
  } catch (e) {
    console.warn(
      "[BulletinCard] Markdown parse failed, falling back to plain text:",
      e.message,
    );
    return {
      isMarkdown: false,
      plainText:
        content.length > 256
          ? content.slice(0, 256) + "…"
          : content || "(empty)",
    };
  }
}

/* Shared HTML config for react-native-render-html — text color must follow
 * the theme (hardcoded #1a1a2e was invisible on the dark surface-card). */
function bulletinPreviewStyles(isDark) {
  return {
    document: {
      style: {
        fontSize: 14,
        lineHeight: 20,
        color: isDark ? "#f0ead6" : "#1a1a2e",
      },
    },
  };
}

/**
 * BulletinCard — single bulletin item for the FlatList feed.
 *
 * Props from the bulletin object (after bulletin2Display):
 *   hash, address, sequence, content, tag[], file[], quote[], signed_at, is_marked, json
 * @param {function} onPress - called when card body is tapped (navigate to detail)
 * @param {function} onTagPress - called when a tag is tapped (filter by tag)
 */
export default React.memo(function BulletinCard({
  bulletin,
  onPress,
  onTagPress,
}) {
  const dispatch = useDispatch();
  const { isDark } = useDarkMode();

  const handleBookmark = React.useCallback(
    (e) => {
      e.stopPropagation();
      dispatch(BulletinMarkToggle({ hash: bulletin.hash }));
    },
    [dispatch, bulletin.hash],
  );

  const handleForward = React.useCallback(
    (e) => {
      e.stopPropagation();
      dispatch(ShowForwardBulletin(bulletin));
    },
    [dispatch, bulletin],
  );

  const {
    isMarkdown: isMd,
    html,
    plainText,
  } = useMemo(
    () => parseBulletinPreview(bulletin.content),
    [bulletin?.content],
  );

  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={onPress}
      className="bg-surface-card rounded-xl border border-secondary-light/30 mb-3 overflow-hidden"
    >
      {/* Header row */}
      <View className="flex-row items-center px-3 pt-3 gap-2">
        {/* Avatar — loads from local file system or shows initials */}
        <AvatarImage
          address={bulletin.address}
          nickname={bulletin.json?.Nickname}
          size={36}
        />

        {/* Nickname / address + timestamp */}
        <View className="flex-1 min-w-0">
          <Text
            numberOfLines={1}
            className="text-sm font-semibold text-text-primary truncate"
          >
            {bulletin.json?.Nickname || shortenAddress(bulletin.address)}
          </Text>
          <Text className="text-xs text-text-secondary/80">
            {formatTimestamp(bulletin.signed_at)} · #{bulletin.sequence}
          </Text>
        </View>

        {/* Forward button — opens contact selector modal */}
        <TouchableOpacity
          onPress={handleForward}
          activeOpacity={0.5}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          className="w-7 h-7 items-center justify-center shrink-0"
        >
          <Ionicons name="arrow-forward-outline" size={20} color="#a89f85" />
        </TouchableOpacity>

        {/* Bookmark toggle — always visible, filled vs outline star */}
        <TouchableOpacity
          onPress={handleBookmark}
          activeOpacity={0.5}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          className="w-7 h-7 items-center justify-center shrink-0"
        >
          <Ionicons
            name={bulletin.is_marked ? "star" : "star-outline"}
            size={20}
            color={bulletin.is_marked ? "#e6b420" : "#a89f85"}
          />
        </TouchableOpacity>
      </View>

      {/* Divider */}
      <View className="h-px bg-secondary-light/30 mx-3 mt-2" />

      {/* Content preview — rendered as markdown when possible */}
      <View className="px-3 py-2">
        {isMd ? (
          <RenderHTML
            source={{ html }}
            tagsStyles={bulletinPreviewStyles(isDark)}
            defaultTextProps={{
              style: { color: isDark ? "#f0ead6" : "#1a1a2e" },
            }}
            systemFonts={["HelveticaNeue", "Roboto", "systemFont"]}
          />
        ) : (
          <Text className="text-sm text-text-primary leading-relaxed">
            {plainText}
          </Text>
        )}
      </View>

      {/* Tag chips row — tap to filter by tag */}
      {bulletin.tag && bulletin.tag.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          className="px-3 pb-2 gap-2"
        >
          {bulletin.tag.map((tag, i) => (
            <TouchableOpacity
              key={`${tag}-${i}`}
              onPress={(e) => {
                e.stopPropagation();
                onTagPress?.(tag);
              }}
              activeOpacity={0.6}
              className="flex-row px-2 py-1 rounded-full bg-primary/10"
            >
              <Text className="text-xs text-primary-dark">#{tag}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* Attachment counts row */}
      {(bulletin.quote?.length || bulletin.file?.length) && (
        <View className="flex-row px-3 pb-2 gap-3">
          {bulletin.quote?.length > 0 && (
            <Text className="text-xs text-text-secondary/70">
              📎 {bulletin.quote.length} quote
              {bulletin.quote.length > 1 ? "s" : ""}
            </Text>
          )}
          {bulletin.file?.length > 0 && (
            <Text className="text-xs text-text-secondary/70">
              📁 {bulletin.file.length} file
              {bulletin.file.length > 1 ? "s" : ""}
            </Text>
          )}
        </View>
      )}
    </TouchableOpacity>
  );
});
