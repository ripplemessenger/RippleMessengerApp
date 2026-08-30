import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  TextInput,
  RefreshControl,
  KeyboardAvoidingView,
  Platform,
  Clipboard,
  Alert,
} from "react-native";
import Ionicons from "react-native-vector-icons/Ionicons";
import { useDispatch, useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import { parseBulletinMarkdown } from "../lib/markdown";
import { RenderHTML } from "react-native-render-html";
import BottomSheet from "../components/common/BottomSheet";

import {
  selectDisplayBulletins,
  selectUserAddress,
  selectContactMap,
} from "../selectors";
import {
  LoadBulletinDetail,
  BulletinReply,
  BulletinQuote,
  BulletinMarkToggle,
  RequestReplyBulletin,
  ShowForwardBulletin,
  SaveBulletinFile,
  ResumeBulletinFiles,
} from "../store/sagas/messenger.actions";
import {
  ContactAdd as ContactAddAction,
  ContactToggleIsFriend as ContactToggleIsFriendAction,
  ContactToggleIsFollow as ContactToggleIsFollowAction,
} from "../store/sagas/messenger.actions";
import AvatarImage from "../components/AvatarImage";
import InlineImage from "../components/InlineImage";
import useDarkMode from "../hooks/useDarkMode";
import { ACCENT } from "../lib/theme";
import { formatTime, shortenAddress } from "../lib/format";
import { setFlashNoticeMessage } from "../store/slices/CommonSlice";

/* Shared HTML config for react-native-render-html — text color must follow
 * the theme (hardcoded #1a1a2e was invisible on the dark surface-card). */
function bulletinHtmlStyles(isDark) {
  return {
    document: {
      style: {
        fontSize: 16,
        lineHeight: 24,
        color: isDark ? "#f0ead6" : "#1a1a2e",
      },
    },
  };
}

/**
 * ReplyCard — compact card for a single reply bulletin in the replies list.
 * Tapping navigates to the reply's bulletin detail view.
 */
function ReplyCard({ bulletin, onPress }) {
  const { t } = useTranslation();
  const contactMap = useSelector(selectContactMap);
  const selfAddress = useSelector(selectUserAddress);
  const displayName = useMemo(() => {
    if (bulletin.address === selfAddress) return t("common.me");
    if (contactMap && contactMap[bulletin.address])
      return contactMap[bulletin.address];
    if (bulletin.json?.Nickname) return bulletin.json.Nickname;
    return shortenAddress(bulletin.address);
  }, [bulletin.address, bulletin.json?.Nickname, contactMap, selfAddress, t]);

  const preview =
    bulletin.content.length > 180
      ? bulletin.content.slice(0, 180) + "…"
      : bulletin.content;

  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={onPress}
      className="bg-surface-card rounded-xl border border-secondary-light/30 mb-3 p-3"
    >
      {/* Author header */}
      <View className="flex-row items-center gap-2 mb-2">
        <AvatarImage
          address={bulletin.address}
          nickname={displayName}
          size={28}
        />
        <View className="flex-1 min-w-0">
          <Text className="text-xs font-semibold text-text-primary truncate">
            {displayName}
          </Text>
          <Text className="text-[10px] text-text-secondary/70">
            {formatTime(bulletin.signed_at)} · #{bulletin.sequence}
          </Text>
        </View>
      </View>

      {/* Content preview */}
      <Text className="text-sm text-text-primary leading-relaxed whitespace-pre-wrap">
        {preview}
      </Text>
    </TouchableOpacity>
  );
}

const MAX_REPLY_LENGTH = 2000;

export default function BulletinDetailScreen({ route, navigation }) {
  const { t } = useTranslation();
  const { hash, address, sequence } = route.params ?? {};
  const dispatch = useDispatch();
  const { isDark } = useDarkMode();
  const { DisplayBulletin: bulletin, DisplayBulletinReplyList: replies } =
    useSelector(selectDisplayBulletins);
  const selfAddress = useSelector(selectUserAddress);
  const contactMap = useSelector(selectContactMap);
  const followList = useSelector((state) => state.User.FollowList || []);
  const friendList = useSelector((state) => state.User.FriendList || []);

  const [replyText, setReplyText] = useState("");
  const [showJsonModal, setShowJsonModal] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (hash || (address && sequence)) {
      dispatch(LoadBulletinDetail({ hash, address, sequence }));
    }
  }, [dispatch, hash, address, sequence]);

  // Load replies once the bulletin is loaded
  useEffect(() => {
    if (bulletin?.hash) {
      dispatch(RequestReplyBulletin({ hash: bulletin.hash, page: 1 }));
    }
  }, [dispatch, bulletin?.hash]);

  // Resume incomplete file downloads once the bulletin is loaded
  useEffect(() => {
    if (bulletin?.hash) {
      dispatch(ResumeBulletinFiles({ hash: bulletin.hash }));
    }
  }, [dispatch, bulletin?.hash]);

  // Forward bulletin — opens the forward contact selector modal
  const handleForward = useCallback(
    (e) => {
      e?.stopPropagation();
      if (bulletin) {
        dispatch(ShowForwardBulletin(bulletin));
      }
    },
    [dispatch, bulletin],
  );

  const handleReplySend = useCallback(() => {
    const content = replyText.trim();
    if (!content) return;
    dispatch(BulletinReply({ content, quoteHash: bulletin.hash }));
    setReplyText("");
  }, [replyText, dispatch, bulletin?.hash]);

  const handleRefreshReplies = useCallback(() => {
    if (refreshing || !bulletin?.hash) return;
    setRefreshing(true);
    dispatch(RequestReplyBulletin({ hash: bulletin.hash, page: 1 }));
    setTimeout(() => {
      setRefreshing(false);
    }, 2000);
  }, [dispatch, bulletin?.hash, refreshing]);

  const handleBookmarkMain = useCallback(
    (e) => {
      e.stopPropagation();
      dispatch(BulletinMarkToggle({ hash: bulletin.hash }));
    },
    [dispatch, bulletin?.hash],
  );

  // Navigate to tag-filtered bulletin list when a tag is tapped.
  // TagBulletins is in RootStack: bulletin tab → MainTabs (Tab) → RootStack
  const handleTagPress = useCallback(
    (tag) => {
      navigation.getParent()?.getParent()?.navigate("TagBulletins", { tag });
    },
    [navigation],
  );

  // Navigate to the reply's detail view when a reply card is tapped
  const handleReplyPress = useCallback(
    (reply) => {
      navigation.navigate("BulletinDetail", {
        hash: reply.hash,
        address: reply.address,
        sequence: reply.sequence,
      });
    },
    [navigation],
  );

  // Download bulletin file attachment
  const handleFilePress = useCallback(
    (file) => {
      dispatch(
        SaveBulletinFile({
          hash: file.Hash,
          size: file.Size,
          name: file.Name,
          ext: file.Ext || "",
        }),
      );
    },
    [dispatch],
  );

  // Copy bulletin content to clipboard
  // Quote bulletin — opens the publish composer with this bulletin quoted
  const handleQuote = useCallback(() => {
    if (!bulletin) return;
    dispatch(
      BulletinQuote({
        Address: bulletin.address,
        Sequence: bulletin.sequence,
        Hash: bulletin.hash,
      }),
    );
  }, [dispatch, bulletin]);

  const handleCopyContent = useCallback(() => {
    Clipboard.setString(bulletin.content || "");
    dispatch(
      setFlashNoticeMessage({
        message: t("common.copied_to_clipboard"),
      }),
    );
  }, [bulletin?.content, dispatch, t]);

  // Copy the raw bulletin JSON to clipboard
  const handleCopyJson = useCallback(() => {
    const jsonStr = JSON.stringify(bulletin?.json ?? bulletin, null, 2);
    Clipboard.setString(jsonStr);
    dispatch(
      setFlashNoticeMessage({
        message: t("common.copied_to_clipboard"),
      }),
    );
  }, [bulletin, dispatch, t]);

  // Toggle Friend — first ensure contact exists, then toggle friend status
  const handleToggleFriend = useCallback(() => {
    if (!bulletin) return;
    const authorAddr = bulletin.address;
    const nickname = bulletin.json?.Nickname || authorAddr;
    // Step 1: Add contact (idempotent — saga checks existence)
    dispatch(ContactAddAction({ address: authorAddr, nickname }));
    // Step 2: Toggle friend status
    dispatch(ContactToggleIsFriendAction({ contact_address: authorAddr }));
    const nowFriend = !friendList.includes(authorAddr);
    Alert.alert(nowFriend ? t("common.friend") : t("common.friend"), nickname, [
      { text: t("common.yes") },
    ]);
  }, [dispatch, bulletin, friendList]);

  // Toggle Follow — first ensure contact exists, then toggle follow status
  const handleToggleFollow = useCallback(() => {
    if (!bulletin) return;
    const authorAddr = bulletin.address;
    const nickname = bulletin.json?.Nickname || authorAddr;
    dispatch(ContactAddAction({ address: authorAddr, nickname }));
    dispatch(ContactToggleIsFollowAction({ contact_address: authorAddr }));
    const nowFollowing = !followList.includes(authorAddr);
    Alert.alert(
      nowFollowing ? t("common.following") : t("common.follow"),
      nickname,
      [{ text: t("common.yes") }],
    );
  }, [dispatch, bulletin, followList]);

  // Navigate to the author's bulletins when tapping the author header
  const handleAuthorPress = useCallback(() => {
    navigation.getParent()?.getParent()?.navigate("AddressBulletins", {
      address: bulletin.address,
    });
  }, [navigation, bulletin?.address]);

  // Memoized bulletin content parsing — runs only when content changes
  const parsedContent = useMemo(
    () => parseBulletinMarkdown(bulletin?.content || ""),
    [bulletin?.hash, bulletin?.content],
  );

  if (!bulletin) {
    return (
      <View className="flex-1 bg-surface items-center justify-center">
        <ActivityIndicator size="large" color={ACCENT} />
        <Text className="text-sm text-text-secondary mt-3">
          {t("common.loading")}
        </Text>
      </View>
    );
  }

  return (
    <>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 64 : 0}
        className="flex-1 bg-surface"
      >
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ padding: 16, flexGrow: 1 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefreshReplies}
              tintColor={ACCENT}
            />
          }
        >
          {/* Author header — tap to navigate to author's bulletins */}
          <View className="flex-row items-center gap-3 mb-4">
            <TouchableOpacity
              onPress={handleAuthorPress}
              activeOpacity={0.6}
              className="flex-row items-center flex-1 min-w-0 gap-2"
            >
              <AvatarImage
                address={bulletin.address}
                nickname={
                  contactMap?.[bulletin.address] || bulletin.json?.Nickname
                }
                size={40}
              />
              <View className="flex-1 min-w-0">
                <Text className="text-base font-semibold text-text-primary">
                  {bulletin.address === selfAddress
                    ? t("common.me")
                    : contactMap?.[bulletin.address] ||
                      bulletin.json?.Nickname ||
                      shortenAddress(bulletin.address)}
                </Text>
                <Text className="text-xs text-text-secondary/80">
                  {shortenAddress(bulletin.address)}
                </Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleAuthorPress}
              activeOpacity={0.6}
              className="items-end shrink-0"
            >
              <Text className="text-xs text-text-secondary/70">
                {formatTime(bulletin.signed_at)}
              </Text>
              <Text className="text-xs text-text-secondary/50">
                #{bulletin.sequence}
              </Text>
            </TouchableOpacity>

            {/* Inline bookmark toggle for main bulletin */}
            <TouchableOpacity
              onPress={handleBookmarkMain}
              activeOpacity={0.5}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              className="ml-2"
            >
              <Ionicons
                name={bulletin.is_marked ? "star" : "star-outline"}
                size={24}
                color={bulletin.is_marked ? ACCENT : "#a89f85"}
              />
            </TouchableOpacity>
          </View>

          {/* Divider */}
          <View className="h-px bg-secondary-light/30 mb-4" />

          {/* Full content — rendered as markdown when possible */}
          <View className="mb-2">
            {(() => {
              const { isMarkdown, html, plainText } = parsedContent;
              if (isMarkdown) {
                return (
                  <RenderHTML
                    source={{ html }}
                    tagsStyles={bulletinHtmlStyles(isDark)}
                    defaultTextProps={{
                      style: { color: isDark ? "#f0ead6" : "#1a1a2e" },
                    }}
                    systemFonts={["HelveticaNeue", "Roboto", "systemFont"]}
                  />
                );
              }
              return (
                <Text className="text-base text-text-primary leading-relaxed whitespace-pre-wrap">
                  {plainText}
                </Text>
              );
            })()}
          </View>

          {/* Action toolbar: copy, friend, follow */}
          <View className="flex-row items-center gap-3 mb-4 pb-2 border-b border-secondary-light/30">
            <TouchableOpacity
              onPress={handleCopyContent}
              activeOpacity={0.6}
              className="flex-row items-center gap-1"
            >
              <Ionicons name="copy-outline" size={16} color="#a89f85" />
              <Text className="text-xs text-text-secondary/70">
                {t("common.copy")}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleQuote}
              activeOpacity={0.6}
              className="flex-row items-center gap-1"
            >
              <Ionicons name="link-outline" size={16} color="#a89f85" />
              <Text className="text-xs text-text-secondary/70">
                {t("ui.quote")}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleForward}
              activeOpacity={0.6}
              className="flex-row items-center gap-1"
            >
              <Ionicons
                name="arrow-forward-outline"
                size={16}
                color="#a89f85"
              />
              <Text className="text-xs text-text-secondary/70">
                {t("common.forward")}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setShowJsonModal(true)}
              activeOpacity={0.6}
              className="flex-row items-center gap-1"
            >
              <Ionicons
                name="information-circle-outline"
                size={16}
                color="#a89f85"
              />
              <Text className="text-xs text-text-secondary/70">
                {t("ui.view_details")}
              </Text>
            </TouchableOpacity>

            {/* Friend button — skip for own bulletins */}
            {bulletin.address !== selfAddress && (
              <TouchableOpacity
                onPress={handleToggleFriend}
                activeOpacity={0.6}
                className="flex-row items-center gap-1"
              >
                <Ionicons
                  name={
                    friendList.includes(bulletin.address)
                      ? "people"
                      : "people-outline"
                  }
                  size={16}
                  color={
                    friendList.includes(bulletin.address) ? ACCENT : "#a89f85"
                  }
                />
                <Text className="text-xs text-text-secondary/70">
                  {friendList.includes(bulletin.address) ? "Friends" : "Friend"}
                </Text>
              </TouchableOpacity>
            )}

            {/* Follow button — skip for own bulletins */}
            {bulletin.address !== selfAddress && (
              <TouchableOpacity
                onPress={handleToggleFollow}
                activeOpacity={0.6}
                className="flex-row items-center gap-1"
              >
                <Ionicons
                  name={
                    followList.includes(bulletin.address)
                      ? "eye"
                      : "eye-outline"
                  }
                  size={16}
                  color={
                    followList.includes(bulletin.address) ? ACCENT : "#a89f85"
                  }
                />
                <Text className="text-xs text-text-secondary/70">
                  {followList.includes(bulletin.address)
                    ? "Following"
                    : "Follow"}
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Tags — tap to filter bulletins by tag */}
          {bulletin.tag && bulletin.tag.length > 0 && (
            <View className="flex-row flex-wrap gap-2 mb-4">
              {bulletin.tag.map((tag, i) => (
                <TouchableOpacity
                  key={`${tag}-${i}`}
                  onPress={() => handleTagPress(tag)}
                  activeOpacity={0.6}
                  className="px-3 py-1 rounded-full bg-primary/10"
                >
                  <Text className="text-sm text-primary-dark">#{tag}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* File attachments — tap to download */}
          {bulletin.file && bulletin.file.length > 0 && (
            <View className="mb-4">
              <Text className="text-sm font-semibold text-text-secondary mb-2">
                {t("ui.attachments")} ({bulletin.file.length})
              </Text>
              {bulletin.file.map((f, i) => (
                <View key={i} className="mb-1">
                  {/* Inline preview for image attachments */}
                  <InlineImage
                    hash={f.Hash}
                    ext={f.Ext || ""}
                    containerStyle={{ marginBottom: 6 }}
                  />
                  <TouchableOpacity
                    onPress={() => handleFilePress(f)}
                    activeOpacity={0.6}
                    className="flex-row items-center gap-2 py-2 px-2 rounded-lg bg-surface-alt/50"
                  >
                    <Ionicons
                      name="document-outline"
                      size={18}
                      color={ACCENT}
                    />
                    <Text className="text-sm text-text-primary flex-1 ml-1">
                      {f.Name}
                    </Text>
                    <Text className="text-xs text-text-secondary/60">
                      {(f.Size / 1024).toFixed(1)} KB
                    </Text>
                    <Ionicons
                      name="download-outline"
                      size={16}
                      color="#a89f85"
                    />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}

          {/* Quotes — clickable links to quoted bulletins when objects */}
          {bulletin.quote && bulletin.quote.length > 0 && (
            <View className="mb-4">
              <Text className="text-sm font-semibold text-text-secondary mb-2">
                {t("ui.quotes")} ({bulletin.quote.length})
              </Text>
              <View className="flex-row flex-wrap gap-2">
                {bulletin.quote.map((q, i) => {
                  const isQuoteObj =
                    typeof q === "object" && q !== null && q.Hash;
                  return (
                    <TouchableOpacity
                      key={i}
                      onPress={() => {
                        if (isQuoteObj) {
                          navigation.navigate("BulletinDetail", {
                            hash: q.Hash,
                            address: q.Address,
                            sequence: q.Sequence,
                          });
                        }
                      }}
                      activeOpacity={0.6}
                      className="flex-row items-center gap-1 px-3 py-1 rounded-full bg-primary/10"
                    >
                      <Text className="text-sm text-primary-dark">
                        {typeof q === "string"
                          ? q
                          : contactMap?.[q.Address]
                            ? `${contactMap[q.Address]}#${q.Sequence}`
                            : `${shortenAddress(q.Address)}#${q.Sequence}`}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}

          {/* Hash reference */}
          <View className="bg-surface-alt/50 rounded-lg px-3 py-2 mb-4">
            <Text className="text-xs text-text-secondary/60 font-mono break-all">
              {bulletin.hash}
            </Text>
          </View>

          {/* Divider */}
          <View className="h-px bg-secondary-light/30 my-4" />

          {/* Replies section */}
          <View className="mb-4">
            <View className="flex-row items-center mb-3">
              <Ionicons name="chatbubble-ellipses" size={20} color="#a89f85" />
              <Text className="text-base font-semibold text-text-primary ml-2">
                {t("ui.reply")} ({replies.length})
              </Text>
            </View>

            {replies.length > 0 ? (
              replies.map((reply, index) => (
                <ReplyCard
                  key={reply.hash || `reply-${index}`}
                  bulletin={reply}
                  onPress={() => handleReplyPress(reply)}
                />
              ))
            ) : (
              <View className="items-center py-8">
                <Ionicons name="chatbubble-outline" size={48} color="#d4c8a8" />
                <Text className="text-base text-text-secondary mt-3">
                  {t("ui.no_replies")}
                </Text>
                {selfAddress && (
                  <Text className="text-xs text-text-secondary/50 mt-1 italic">
                    {t("ui.be_first_reply")}
                  </Text>
                )}
              </View>
            )}
          </View>
        </ScrollView>

        {/* Reply input bar at bottom */}
        <View className="flex-row items-center px-3 py-2 bg-surface-alt border-t border-secondary-light/30">
          <TextInput
            value={replyText}
            onChangeText={setReplyText}
            placeholder={t("ui.write_reply")}
            placeholderTextColor="#a89f85"
            className="flex-1 mr-2 bg-surface rounded-full px-4 py-2 text-base text-text-primary border border-secondary-light/30"
            multiline
            maxLength={MAX_REPLY_LENGTH}
            onSubmitEditing={handleReplySend}
          />

          {/* Send reply button */}
          <TouchableOpacity
            onPress={handleReplySend}
            activeOpacity={0.6}
            disabled={!replyText.trim()}
            className={`w-10 h-10 rounded-full items-center justify-center ${
              replyText.trim() ? "bg-primary" : "bg-secondary-light/40"
            }`}
          >
            <Ionicons
              name="send"
              size={20}
              color={replyText.trim() ? "#ffffff" : "#a89f85"}
            />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {/* JSON details modal */}
      <BottomSheet
        visible={showJsonModal}
        onClose={() => setShowJsonModal(false)}
        title={t("ui.bulletin_json")}
      >
        <View className="flex-row items-center justify-end gap-2">
          <TouchableOpacity
            onPress={handleCopyJson}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="copy-outline" size={22} color="#a89f85" />
          </TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={{ paddingBottom: 16 }}>
          <Text
            className="text-xs font-mono text-text-primary"
            selectable
            style={{
              padding: 12,
              backgroundColor: "#1a1a2e",
              borderRadius: 8,
              color: "#e0e0e0",
            }}
          >
            {JSON.stringify(bulletin?.json ?? bulletin, null, 2)}
          </Text>
        </ScrollView>
      </BottomSheet>
    </>
  );
}
