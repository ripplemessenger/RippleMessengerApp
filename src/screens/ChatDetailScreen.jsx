import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  RefreshControl,
  KeyboardAvoidingView,
  Platform,
  Modal,
  Alert,
  Clipboard,
  ScrollView,
} from "react-native";
import Ionicons from "react-native-vector-icons/Ionicons";
import { useDispatch, useSelector } from "react-redux";
import { useTranslation } from "react-i18next";

import AvatarImage from "../components/AvatarImage";
import InlineImage from "../components/InlineImage";
import InlineVideo from "../components/InlineVideo";
import ImageViewer from "../components/ImageViewer";
import VideoPlayer from "../components/VideoPlayer";
import ModalShell from "../components/common/ModalShell";
import useDarkMode from "../hooks/useDarkMode";
import {
  selectCurrentSession,
  selectCurrentSessionMessages,
  selectUserAddress,
  selectContactMap,
  selectGroupMembers,
} from "../selectors";
import {
  SendContent,
  LoadCurrentSession,
  LoadSessionList,
  SendFile,
  FetchChatFile,
  SaveChatFile,
  DeleteGroup,
  ClearGroupData,
} from "../store/sagas/messenger.actions";
import { setFlashNoticeMessage } from "../store/slices/CommonSlice";
import { pickFile } from "../services/mediaPicker";
import { SessionType } from "../lib/AppConst";
import { MessageObjectType } from "../lib/MessengerConst";
import { dbAPI } from "../db";
import { ACCENT, ICON_MUTED } from "../lib/theme";
import { formatTime, shortenAddress, formatFileSize } from "../lib/format";

/**
 * Resolve a display name for an address using the contact map.
 */
function resolveName(address, contactMap, selfAddress) {
  if (selfAddress && address === selfAddress) return "Me";
  const nickname = contactMap[address];
  if (nickname) return nickname;
  return shortenAddress(address);
}

/**
 * Extract plain text content from a message.
 */
function extractContent(msg) {
  if (!msg) return "";
  if (msg.is_object && msg.content) {
    const obj = msg.content;
    // File object (PrivateChatFile or GroupChatFile) — show full name with extension
    if (
      obj.ObjectType === MessageObjectType.PrivateChatFile ||
      obj.ObjectType === MessageObjectType.GroupChatFile
    ) {
      let name = obj.Name || "File";
      const ext = obj.Ext || "";
      if (ext && !name.toLowerCase().endsWith(ext.toLowerCase())) {
        // Strip trailing dot from name if present, then append ext
        const cleanName = name.endsWith(".") ? name.slice(0, -1) : name;
        const dot = ext.startsWith(".") ? "" : ".";
        name = `${cleanName}${dot}${ext}`;
      } else if (name.endsWith(".")) {
        // Name has trailing dot but no ext — strip it
        name = name.slice(0, -1);
      }
      return name;
    }
    if (obj.Name) {
      return obj.Name;
    }
    // Bulletin reference — return null, handled specially in MessageBubble
    if (obj.ObjectType === MessageObjectType.Bulletin) {
      return null;
    }
  }
  return typeof msg.content === "string" ? msg.content : "";
}

/**
 * Check if a message contains a file object (PrivateChatFile or GroupChatFile).
 */
function isFileMessage(msg) {
  if (!msg?.is_object || !msg?.content) return false;
  const obj = msg.content;
  return (
    obj.ObjectType === MessageObjectType.PrivateChatFile ||
    obj.ObjectType === MessageObjectType.GroupChatFile
  );
}

/**
 * Get a unique key for a message (used as file status cache key).
 */
function getMessageKey(msg) {
  return msg.hash || `msg-${msg.sequence}-${msg.signed_at}`;
}

/**
 * MessageBubble — renders a single chat message.
 *
 * @param {object} props
 * @param {object} props.message - Message object from DB
 * @param {'private'|'group'} props.mode - Chat type
 * @param {string} props.selfAddress - Current user's address
 * @param {object} props.contactMap - Contact map for name resolution
 * @param {object} props.fileDownloadStatus - Map of messageKey -> 'downloading' | 'saved'
 * @param {function} props.onFileTap - Callback when a file bubble is tapped
 */
const MessageBubble = React.memo(function MessageBubble({
  message,
  mode,
  selfAddress,
  contactMap,
  fileDownloadStatus,
  onFileTap,
  onImageTap,
  onVideoTap,
  onSequenceTap,
  navigation,
}) {
  const { t } = useTranslation();
  const senderField = mode === "group" ? "address" : "sour";
  const senderAddress = message[senderField] || "";
  const isSelf = senderAddress === selfAddress;

  const content = extractContent(message);
  const fileHash = message.content?.Hash;
  // Check Redux FileSavedMap — updated when download completes
  const savedToken = useSelector((state) =>
    fileHash ? (state.Messenger.FileSavedMap?.[fileHash] ?? null) : null,
  );
  // Check DB for files saved in previous sessions
  const [dbFileSaved, setDbFileSaved] = useState(false);
  useEffect(() => {
    if (!fileHash) return;
    let cancelled = false;
    (async () => {
      const file = await dbAPI.getFileByHash(fileHash);
      if (!cancelled && file?.is_saved) setDbFileSaved(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [fileHash, savedToken]);
  // Download progress (cursor/length) — updated per chunk in messenger.ws.binary.js
  const fileProgress = useSelector((state) =>
    fileHash ? (state.Messenger.FileProgressMap?.[fileHash] ?? null) : null,
  );
  const fileStatus =
    savedToken || dbFileSaved
      ? "saved"
      : fileDownloadStatus?.[getMessageKey(message)] ||
        (fileProgress ? "downloading" : undefined);

  return (
    <View className={`flex-row ${isSelf ? "flex-row-reverse" : ""} mb-3`}>
      {/* Sender avatar */}
      <AvatarImage
        address={senderAddress}
        nickname={
          !isSelf
            ? resolveName(senderAddress, contactMap, selfAddress)
            : undefined
        }
        size={32}
        style={{
          marginLeft: isSelf ? 8 : undefined,
          marginRight: !isSelf ? 8 : undefined,
        }}
      />

      <View
        className={isSelf ? "max-w-[75%] items-end" : "max-w-[75%] items-start"}
      >
        {/* Sender name (group mode, or when not self) */}
        {!isSelf && mode === "group" && (
          <Text className="text-xs text-text-secondary/70 mb-1 ml-1">
            {resolveName(senderAddress, contactMap, selfAddress)}
          </Text>
        )}

        {/* Bubble */}
        <View
          className={`px-1 py-1 rounded-2xl ${
            isSelf
              ? "bg-primary/30 rounded-tr-sm items-end"
              : "bg-surface-alt rounded-tl-sm border border-secondary-light/20"
          }`}
        >
          {/* Sequence + Timestamp (above content) */}
          <View
            className={`flex-row items-center gap-0 mb-1 ${isSelf ? "self-end" : "self-start"}`}
          >
            {message.sequence ? (
              <TouchableOpacity
                onPress={() => onSequenceTap?.(message)}
                hitSlop={6}
                activeOpacity={0.6}
              >
                <View className="px-1 py-0.5 rounded border border-secondary-light/30">
                  <Text className="text-[10px] text-text-secondary/70">
                    #{message.sequence}
                  </Text>
                </View>
              </TouchableOpacity>
            ) : null}
            <Text className="text-[10px] text-text-secondary/50">
              {formatTime(message.signed_at)}
            </Text>
          </View>

          {/* File message — inline image (tap to view) + file row (tap to save/download) */}
          {isFileMessage(message) ? (
            <View>
              {/* Inline preview for image files — tap to open full-screen viewer */}
              <InlineImage
                hash={message.content?.Hash}
                ext={message.content?.Ext || ""}
                containerStyle={{ marginBottom: 6 }}
                onPress={onImageTap}
              />
              {/* Inline preview for video files — tap to open full-screen player */}
              <InlineVideo
                hash={message.content?.Hash}
                ext={message.content?.Ext || ""}
                containerStyle={{ marginBottom: 6 }}
                onPress={onVideoTap}
              />
              {/* File row — tap to save/download (all file types) */}
              <TouchableOpacity
                onPress={() => onFileTap?.(message)}
                activeOpacity={0.6}
                disabled={fileStatus === "downloading"}
              >
                <View className="flex-row items-start gap-2">
                  <Ionicons
                    name={
                      fileStatus === "saved"
                        ? "checkmark-circle"
                        : "document-attach"
                    }
                    size={16}
                    color={
                      fileStatus === "saved"
                        ? "#22c55e"
                        : fileStatus === "downloading"
                          ? "#f59e0b"
                          : "#a89f85"
                    }
                    style={{ marginTop: 2 }}
                  />
                  <View>
                    <Text className="text-base text-text-primary break-words">
                      {content}
                    </Text>
                    <View className="flex-row items-center gap-2 mt-0.5">
                      {message.content?.Size > 0 && (
                        <Text className="text-xs text-text-secondary/60">
                          ({formatFileSize(message.content.Size)})
                        </Text>
                      )}
                      {fileStatus === "downloading" && (
                        <Text className="text-xs text-primary">
                          {fileProgress && fileProgress.length > 0
                            ? `(${fileProgress.cursor}/${fileProgress.length})`
                            : t("common.loading")}
                        </Text>
                      )}
                    </View>
                  </View>
                </View>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              {/* Bulletin link — clickable, navigates to bulletin detail */}
              {message.is_object &&
              message.content?.ObjectType === MessageObjectType.Bulletin ? (
                <TouchableOpacity
                  onPress={() => {
                    const obj = message.content;
                    navigation.navigate("Bulletin", {
                      screen: "BulletinDetail",
                      params: {
                        hash: obj.Hash,
                        address: obj.Address,
                        sequence: obj.Sequence,
                      },
                    });
                  }}
                  activeOpacity={0.6}
                  className="px-3 py-1 rounded-full border border-primary/30 bg-primary/5"
                >
                  <Text className="text-sm text-primary-dark">
                    {resolveName(
                      message.content.Address,
                      contactMap,
                      selfAddress,
                    )}
                    #{message.content.Sequence}
                  </Text>
                </TouchableOpacity>
              ) : content ? (
                <Text className="text-base text-text-primary whitespace-pre-wrap break-words">
                  {content}
                </Text>
              ) : (
                <Text className="text-sm text-text-secondary/50 italic">
                  [Empty message]
                </Text>
              )}
            </>
          )}
        </View>
      </View>
    </View>
  );
});

/**
 * ChatInfoModal — modal showing chat details.
 * Private chat: contact info, follow/friend status, ECDH handshake status.
 * Group chat: group name, member list, group hash.
 */
function ChatInfoModal({ visible, session, mode, onClose, onGroupDeleted }) {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const selfAddress = useSelector(selectUserAddress);
  const contactMap = useSelector(selectContactMap);
  const groupMembers = useSelector(selectGroupMembers);

  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!visible || !session) return;

    setLoading(true);
    let isMounted = true;

    (async () => {
      try {
        if (mode === "private") {
          const remoteAddr = session.remote || session.address;
          const [friend, follow] = await Promise.all([
            dbAPI.getFriend(selfAddress, remoteAddr),
            dbAPI.getFollow(selfAddress, remoteAddr),
          ]);
          if (!isMounted) return;
          setInfo({ friend: !!friend, follow: !!follow });
        } else {
          // Group mode
          const members = groupMembers[session.hash] || session.member || [];
          const filtered = Array.isArray(members)
            ? members.filter((m) => m !== selfAddress)
            : [];
          // Check if current user is the group creator (only creator can delete)
          let isCreator = false;
          try {
            const group = await dbAPI.getGroupByHash(session.hash);
            isCreator = !!group && group.created_by === selfAddress;
          } catch {
            // silent — button just won't show
          }
          if (!isMounted) return;
          setInfo({ members: filtered, isCreator });
        }
      } catch (e) {
        console.error("[ChatInfoModal] failed to load info:", e.message);
      } finally {
        if (isMounted) setLoading(false);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [visible, session, mode, selfAddress, groupMembers]);

  const handleDeleteGroup = useCallback(() => {
    Alert.alert(t("group.delete_title"), t("group.delete_confirm"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("group.delete_title"),
        style: "destructive",
        onPress: () => {
          dispatch(DeleteGroup({ hash: session.hash }));
          if (onGroupDeleted) onGroupDeleted();
          onClose();
        },
      },
    ]);
  }, [t, session, dispatch, onClose, onGroupDeleted]);

  const handleClearGroupData = useCallback(() => {
    Alert.alert(t("group.clear_data_title"), t("group.clear_data_confirm"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("group.clear_data_title"),
        style: "destructive",
        onPress: () => {
          dispatch(ClearGroupData({ hash: session.hash }));
          onClose();
        },
      },
    ]);
  }, [t, session, dispatch, onClose]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableOpacity
        className="flex-1 bg-black/45 justify-center items-center px-6"
        activeOpacity={1}
        onPress={onClose}
      >
        <TouchableOpacity
          className="w-full max-w-sm bg-surface-card rounded-2xl p-5 border border-secondary-light"
          activeOpacity={1}
          onPress={() => {}}
        >
          {/* Header */}
          <View className="flex-row items-center justify-between mb-4">
            <Text className="text-lg font-bold text-text-primary">
              {mode === "private" ? t("ui.contact_info") : t("ui.group_info")}
            </Text>
          </View>

          {loading ? (
            <View className="items-center py-8">
              <Ionicons name="hourglass" size={32} color="#d4c8a8" />
              <Text className="text-sm text-text-secondary mt-2">
                {t("common.loading")}
              </Text>
            </View>
          ) : mode === "private" ? (
            /* Private chat info */
            <View>
              {/* Contact name + address */}
              <View className="mb-3">
                <Text className="text-xs text-text-secondary/60 mb-1">
                  {t("ui.contact")}
                </Text>
                <Text className="text-base font-semibold text-text-primary">
                  {resolveName(session.remote || session.address, contactMap)}
                </Text>
              </View>
              <View className="mb-3">
                <Text className="text-xs text-text-secondary/60 mb-1">
                  {t("ui.address")}
                </Text>
                <Text
                  className="text-sm text-text-primary font-mono"
                  numberOfLines={1}
                >
                  {session.remote || session.address}
                </Text>
              </View>

              {/* ECDH handshake status */}
              <View className="flex-row items-center justify-between py-2 border-t border-secondary-light/20">
                <Text className="text-sm text-text-primary">
                  {t("ui.ecdh_handshake")}
                </Text>
                <View className="flex-row items-center gap-1.5">
                  <Ionicons
                    name={
                      session.aes_key !== undefined
                        ? "checkmark-circle"
                        : "time-outline"
                    }
                    size={18}
                    color={
                      session.aes_key !== undefined ? "#22c55e" : "#f59e0b"
                    }
                  />
                  <Text
                    className={`text-sm ${session.aes_key !== undefined ? "text-status-success" : "text-primary"}`}
                  >
                    {session.aes_key !== undefined
                      ? t("ui.established")
                      : t("ui.pending")}
                  </Text>
                </View>
              </View>
            </View>
          ) : (
            /* Group chat info */
            <View>
              {/* Group name */}
              <View className="mb-3">
                <Text className="text-xs text-text-secondary/60 mb-1">
                  {t("ui.group_name")}
                </Text>
                <Text className="text-base font-semibold text-text-primary">
                  {session.name || "Group"}
                </Text>
              </View>

              {/* Group hash */}
              <View className="mb-3">
                <Text className="text-xs text-text-secondary/60 mb-1">
                  {t("ui.group_hash")}
                </Text>
                <Text
                  className="text-xs text-text-primary font-mono"
                  numberOfLines={2}
                >
                  {session.hash}
                </Text>
              </View>

              {/* Member count */}
              <View className="mb-2">
                <Text className="text-xs text-text-secondary/60 mb-1">
                  {t("ui.members", { count: info?.members?.length || 0 })}
                </Text>
              </View>

              {/* Member list */}
              <ScrollView
                style={{ maxHeight: 300 }}
                showsVerticalScrollIndicator={false}
              >
                {info?.members?.map((member, idx) => (
                  <View
                    key={member || `member-${idx}`}
                    className="flex-row items-center gap-2 py-1.5"
                  >
                    <Ionicons name="person" size={16} color="#a89f85" />
                    <Text
                      className="text-sm text-text-primary flex-1"
                      numberOfLines={1}
                    >
                      {resolveName(member, contactMap)}
                    </Text>
                    <TouchableOpacity
                      activeOpacity={0.6}
                      hitSlop={8}
                      onPress={() => {
                        Clipboard.setString(member);
                        dispatch(
                          setFlashNoticeMessage({
                            message: `${t("ui.copied_prefix")} ${member.slice(0, 8)}...`,
                            duration: 2000,
                          }),
                        );
                      }}
                      className="p-1"
                    >
                      <Ionicons name="copy-outline" size={14} color="#a89f85" />
                    </TouchableOpacity>
                  </View>
                ))}
              </ScrollView>

              {/* Delete group (creator only) */}
              {info?.isCreator && (
                <TouchableOpacity
                  onPress={handleDeleteGroup}
                  activeOpacity={0.7}
                  className="flex-row items-center justify-center gap-2 mt-4 py-3 rounded-xl bg-red-500/10 border border-red-500/30"
                >
                  <Ionicons name="trash-outline" size={18} color="#ef4444" />
                  <Text className="text-sm font-medium text-red-500">
                    {t("group.delete_title")}
                  </Text>
                </TouchableOpacity>
              )}

              {/* Clear group data (all members) */}
              <TouchableOpacity
                onPress={handleClearGroupData}
                activeOpacity={0.7}
                className="flex-row items-center justify-center gap-2 mt-2 py-3 rounded-xl bg-orange-500/10 border border-orange-500/30"
              >
                <Ionicons name="archive-outline" size={18} color="#f97316" />
                <Text className="text-sm font-medium text-orange-500">
                  {t("group.clear_data_title")}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

/**
 * ChatDetailScreen — the message conversation view.
 *
 * Features:
 * - FlatList of message bubbles (self right, other left)
 * - Message input bar with send button
 * - File attachment button (picks image/document, dispatches SendFile saga)
 * - Pull-to-refresh for older messages
 * - Connection indicator
 * - Chat info modal (contact/group details)
 * - Interactive file bubbles with download status
 */
export default function ChatDetailScreen({ route, navigation }) {
  const { t } = useTranslation();
  const { isDark } = useDarkMode();
  const { session } = route.params;
  const dispatch = useDispatch();

  const currentSession = useSelector(selectCurrentSession);
  const messages = useSelector(selectCurrentSessionMessages);
  const selfAddress = useSelector(selectUserAddress);
  const contactMap = useSelector(selectContactMap);

  const [inputText, setInputText] = useState("");
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [fileDownloadStatus, setFileDownloadStatus] = useState({});
  const [showJsonModal, setShowJsonModal] = useState(false);
  const [jsonContent, setJsonContent] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [viewerUri, setViewerUri] = useState(null);
  const [videoUri, setVideoUri] = useState(null);
  // Group closed (disbanded) — input disabled, history preserved
  const [groupClosed, setGroupClosed] = useState(
    session.type === SessionType.Group && session.delete_json !== null,
  );
  const flatListRef = useRef(null);

  // Determine if this is private or group
  const mode = session.type === SessionType.Group ? "group" : "private";

  // Session display name
  let sessionName = "";
  if (session.type === SessionType.Private) {
    sessionName = resolveName(session.remote || session.address, contactMap);
  } else {
    sessionName = session.name || "Group";
  }

  // Use currentSession (which may be updated by saga) or fall back to route param
  const activeSession = currentSession || session;

  // Load session when screen mounts
  useEffect(() => {
    dispatch(LoadCurrentSession(session));
  }, [dispatch, session]);

  // Scroll to bottom when messages update
  const prevMsgCount = useRef(0);
  useEffect(() => {
    if (messages.length > prevMsgCount.current) {
      // New message arrived, scroll to bottom
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
    prevMsgCount.current = messages.length;
  }, [messages.length]);

  const handleSend = useCallback(() => {
    const content = inputText.trim();
    if (!content) return;

    dispatch(SendContent({ content }));
    setInputText("");
  }, [inputText, dispatch]);

  const handleSequenceTap = useCallback((message) => {
    try {
      const json = message.json || message;
      setJsonContent(JSON.stringify(json, null, 2));
    } catch (e) {
      setJsonContent(String(json));
    }
    setShowJsonModal(true);
  }, []);

  const handleRefresh = useCallback(() => {
    if (refreshing) return;
    setRefreshing(true);
    dispatch(LoadCurrentSession(session));
    setTimeout(() => {
      setRefreshing(false);
    }, 3000);
  }, [dispatch, session, refreshing]);

  const handleBack = useCallback(() => {
    dispatch(LoadSessionList());
    navigation.goBack();
  }, [navigation, dispatch]);

  const handleAttach = useCallback(async () => {
    const result = await pickFile();
    if (!result) return;
    dispatch(SendFile({ file_uri: result.uri }));
  }, [dispatch]);

  const handleFileTap = useCallback(
    async (message) => {
      const fileHash = message.content?.Hash;
      if (!fileHash) return;

      const ext = message.content?.Ext || "";
      const existingFile = await dbAPI.getFileByHash(fileHash);
      const msgKey = getMessageKey(message);

      if (existingFile?.is_saved) {
        // File already saved, trigger SaveChatFile to copy to shared location
        setFileDownloadStatus((prev) => ({ ...prev, [msgKey]: "saved" }));
        dispatch(
          SaveChatFile({
            hash: fileHash,
            name: message.content.Name || "file",
            ext,
          }),
        );
      } else {
        // Start downloading
        setFileDownloadStatus((prev) => ({ ...prev, [msgKey]: "downloading" }));
        dispatch(
          FetchChatFile({
            hash: fileHash,
            size: message.content.Size,
          }),
        );
      }
    },
    [dispatch],
  );

  const renderMessage = useCallback(
    ({ item }) => (
      <MessageBubble
        message={item}
        mode={mode}
        selfAddress={selfAddress}
        contactMap={contactMap}
        fileDownloadStatus={fileDownloadStatus}
        onFileTap={handleFileTap}
        onImageTap={(uri) => setViewerUri(uri)}
        onVideoTap={(uri) => setVideoUri(uri)}
        onSequenceTap={handleSequenceTap}
        navigation={navigation}
      />
    ),
    [
      mode,
      selfAddress,
      contactMap,
      fileDownloadStatus,
      handleFileTap,
      handleSequenceTap,
    ],
  );

  const keyExtractor = useCallback((item) => {
    return item.hash || `msg-${item.sequence}-${item.signed_at}`;
  }, []);

  // Determine if AES key is ready (can send messages)
  // Group closed (disbanded) → cannot send
  const canSend =
    (currentSession?.aes_key !== undefined || mode === "group") && !groupClosed;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 64 : 0}
      className="flex-1 bg-surface"
    >
      {/* Header */}
      <View className="flex-row items-center px-3 py-2 bg-primary/5 border-b border-secondary-light/30">
        <TouchableOpacity onPress={handleBack} activeOpacity={0.6}>
          <Ionicons name="arrow-back" size={24} color={ICON_MUTED} />
        </TouchableOpacity>

        <View className="flex-row items-center flex-1 ml-2">
          {/* Session avatar */}
          {mode === "group" ? (
            <View className="w-9 h-9 rounded-full bg-secondary/40 items-center justify-center">
              <Ionicons name="people" size={18} color={ICON_MUTED} />
            </View>
          ) : (
            <AvatarImage
              address={session.remote || session.address}
              nickname={session.name}
              size={36}
            />
          )}

          <View className="ml-2">
            <Text
              className="text-base font-semibold text-text-primary"
              numberOfLines={1}
            >
              {sessionName}
            </Text>
          </View>
        </View>

        {/* Info button */}
        <TouchableOpacity
          onPress={() => setShowInfoModal(true)}
          activeOpacity={0.6}
        >
          <Ionicons
            name="information-circle-outline"
            size={22}
            color={ICON_MUTED}
          />
        </TouchableOpacity>
      </View>

      {/* Messages list */}
      <FlatList
        ref={flatListRef}
        data={messages}
        renderItem={renderMessage}
        keyExtractor={keyExtractor}
        contentContainerStyle={{ padding: 12, flexGrow: 1 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={ACCENT}
          />
        }
        ListEmptyComponent={
          <View className="flex-1 items-center justify-center py-10">
            <Ionicons
              name="chatbubble-ellipses-outline"
              size={48}
              color="#d4c8a8"
            />
            <Text className="text-base text-text-secondary mt-3">
              {t("ui.no_messages")}
            </Text>
            {!canSend && mode !== "group" && (
              <Text className="text-xs text-text-secondary/50 mt-1 italic">
                {t("ui.waiting_handshake")}
              </Text>
            )}
          </View>
        }
      />

      {/* Input bar */}
      {groupClosed ? (
        /* Group disbanded — read-only */
        <View className="items-center justify-center py-3 bg-surface-alt border-t border-secondary-light/30">
          <View className="flex-row items-center gap-2">
            <Ionicons name="lock-closed" size={16} color="#a89f85" />
            <Text className="text-sm text-text-secondary italic">
              {t("group.disbanded")}
            </Text>
          </View>
        </View>
      ) : (
        <View className="flex-row items-center px-3 py-2 bg-surface-alt border-t border-secondary-light/30">
          {/* Attach file button → pickFile() → SendFile saga */}
          <TouchableOpacity onPress={handleAttach} activeOpacity={0.6}>
            <Ionicons name="attach" size={24} color="#a89f85" />
          </TouchableOpacity>

          {/* Text input */}
          <TextInput
            value={inputText}
            onChangeText={setInputText}
            placeholder={t("ui.type_message")}
            placeholderTextColor="#a89f85"
            className="flex-1 ml-2 mr-2 bg-surface rounded-full px-4 py-2 text-base text-text-primary border border-secondary-light/30"
            multiline
            maxLength={4096}
            onSubmitEditing={handleSend}
            editable={canSend}
          />

          {/* Send button */}
          <TouchableOpacity
            onPress={handleSend}
            activeOpacity={0.6}
            disabled={!inputText.trim() || !canSend}
            className={`w-10 h-10 rounded-full items-center justify-center ${
              inputText.trim() && canSend
                ? "bg-primary"
                : "bg-secondary-light/40"
            }`}
          >
            <Ionicons
              name="send"
              size={20}
              color={inputText.trim() && canSend ? "#ffffff" : "#a89f85"}
            />
          </TouchableOpacity>
        </View>
      )}

      {/* Chat Info Modal */}
      <ChatInfoModal
        visible={showInfoModal}
        session={activeSession}
        mode={mode}
        onClose={() => setShowInfoModal(false)}
        onGroupDeleted={() => setGroupClosed(true)}
      />

      {/* JSON Viewer Modal */}
      <ModalShell
        visible={showJsonModal}
        onClose={() => setShowJsonModal(false)}
        title={t("ui.message_json")}
      >
        <ScrollView style={{ maxHeight: "60%" }}>
          <Text
            style={{
              fontSize: 12,
              fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
              color: isDark ? "#c8c8d0" : "#333",
            }}
          >
            {jsonContent}
          </Text>
        </ScrollView>
      </ModalShell>

      {/* Full-screen image viewer */}
      <ImageViewer
        uri={viewerUri}
        visible={viewerUri !== null}
        onClose={() => setViewerUri(null)}
      />

      {/* Full-screen video player */}
      <VideoPlayer
        uri={videoUri}
        visible={videoUri !== null}
        onClose={() => setVideoUri(null)}
      />
    </KeyboardAvoidingView>
  );
}
