import React, { useMemo } from "react";
import { View, Text, TouchableOpacity, ScrollView } from "react-native";
import Ionicons from "react-native-vector-icons/Ionicons";
import { useDispatch, useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import { parseBulletinMarkdown } from "../../lib/markdown";
import { RenderHTML } from "react-native-render-html";
import { formatTime, shortenAddress } from "../../lib/format";

import {
  BulletinMarkToggle,
  ShowForwardBulletin,
  BulletinQuote,
} from "../../store/sagas/messenger.actions";
import AvatarImage from "../AvatarImage";
import useDarkMode from "../../hooks/useDarkMode";
import { ACCENT } from "../../lib/theme";
import { selectContactMap, selectUserAddress } from "../../selectors";

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
  const { t } = useTranslation();
  const { isDark } = useDarkMode();
  const contactMap = useSelector(selectContactMap);
  const selfAddress = useSelector(selectUserAddress);

  // Resolve display name: contact nickname > bulletin nickname > shortened address
  const displayName = useMemo(() => {
    if (bulletin.address === selfAddress) return t("common.me");
    if (contactMap && contactMap[bulletin.address])
      return contactMap[bulletin.address];
    if (bulletin.json?.Nickname) return bulletin.json.Nickname;
    return shortenAddress(bulletin.address);
  }, [bulletin.address, bulletin.json?.Nickname, contactMap, selfAddress, t]);

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

  const handleQuote = React.useCallback(
    (e) => {
      e.stopPropagation();
      dispatch(
        BulletinQuote({
          Address: bulletin.address,
          Sequence: bulletin.sequence,
          Hash: bulletin.hash,
        }),
      );
    },
    [dispatch, bulletin],
  );

  const {
    isMarkdown: isMd,
    html,
    plainText,
  } = useMemo(
    () => parseBulletinMarkdown(bulletin.content, 256),
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
          nickname={displayName}
          size={36}
        />

        {/* Nickname / address + timestamp */}
        <View className="flex-1 min-w-0">
          <View className="flex-row items-center gap-1">
            <View className="px-2 py-0.5 rounded-full border border-primary/30 bg-primary/5">
              <Text className="text-sm font-semibold text-primary-dark">
                {displayName}#{bulletin.sequence}
              </Text>
            </View>
            {bulletin.quote?.length > 0 && (
              <Text className="text-xs text-text-secondary/70">
                🔗{bulletin.quote.length}
              </Text>
            )}
            {bulletin.file?.length > 0 && (
              <Text className="text-xs text-text-secondary/70">
                📁{bulletin.file.length}
              </Text>
            )}
          </View>
          <Text className="text-xs text-text-secondary/80">
            {formatTime(bulletin.signed_at)}
          </Text>
        </View>

        {/* Quote button — adds this bulletin as a quote in the publish composer */}
        <TouchableOpacity
          onPress={handleQuote}
          activeOpacity={0.5}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          className="w-7 h-7 items-center justify-center shrink-0"
        >
          <Ionicons name="link-outline" size={20} color="#a89f85" />
        </TouchableOpacity>

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
            color={bulletin.is_marked ? ACCENT : "#a89f85"}
          />
        </TouchableOpacity>
      </View>

      {/* Divider */}
      <View className="h-px bg-secondary-light/30 mx-3 mt-2" />

      {/* Tag chips row — tap to filter by tag (wraps to multiple lines) */}
      {bulletin.tag && bulletin.tag.length > 0 && (
        <View className="px-3 pt-2 flex flex-row flex-wrap">
          {bulletin.tag.map((tag, i) => (
            <TouchableOpacity
              key={`${tag}-${i}`}
              onPress={(e) => {
                e.stopPropagation();
                onTagPress?.(tag);
              }}
              activeOpacity={0.6}
              className="flex-row px-2 py-1 rounded-full bg-primary/10 mr-2 mb-2"
            >
              <Text className="text-xs text-primary-dark">#{tag}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

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
    </TouchableOpacity>
  );
});
