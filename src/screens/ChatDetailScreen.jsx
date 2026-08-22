import React, { useCallback, useEffect, useRef, useState } from 'react';
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
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useDispatch, useSelector } from 'react-redux';

import AvatarImage from '../components/AvatarImage';
import { selectCurrentSession, selectCurrentSessionMessages, selectUserAddress, selectContactMap, selectMessengerConnStatus, selectGroupMembers } from '../selectors';
import { SendContent, LoadCurrentSession, LoadSessionList, SendFile, FetchChatFile, SaveChatFile } from '../store/sagas/messenger.actions';
import { pickFile } from '../services/mediaPicker';
import { SessionType } from '../lib/AppConst';
import { MessageObjectType } from '../lib/MessengerConst';
import { dbAPI } from '../db';

/**
 * Format a timestamp (ms epoch) into HH:mm time string.
 */
function formatTime(timestamp) {
  if (!timestamp || typeof timestamp !== 'number') return '';
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/**
 * Format file size in bytes to a human-readable string.
 */
function formatFileSize(bytes) {
  if (!bytes || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Get initials from an address for avatar placeholder.
 */
function getInitials(address) {
  if (!address) return '?';
  return (address.substring(0, 2)).toUpperCase();
}

/**
 * Resolve a display name for an address using the contact map.
 */
function resolveName(address, contactMap) {
  const contact = contactMap[address];
  if (contact?.nickname) return contact.nickname;
  // Show truncated address
  if (address.length > 10) {
    return address.substring(0, 5) + '...' + address.substring(address.length - 4);
  }
  return address;
}

/**
 * Shorten an address for compact display.
 */
function shortenAddress(addr) {
  if (!addr || addr.length < 14) return addr || '';
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

/**
 * Extract plain text content from a message.
 */
function extractContent(msg) {
  if (!msg) return '';
  if (msg.is_object && msg.content) {
    const obj = msg.content;
    if (obj.Name) {
      return `📎 ${obj.Name}`;
    }
    // Bulletin reference
    if (obj.ObjectType === MessageObjectType.Bulletin) {
      return '📰 Shared a bulletin';
    }
    // File object (PrivateChatFile or GroupChatFile)
    if (obj.ObjectType === MessageObjectType.PrivateChatFile || obj.ObjectType === MessageObjectType.GroupChatFile) {
      const name = obj.Name || 'File';
      return `📎 ${name}`;
    }
  }
  return typeof msg.content === 'string' ? msg.content : '';
}

/**
 * Check if a message contains a file object (PrivateChatFile or GroupChatFile).
 */
function isFileMessage(msg) {
  if (!msg?.is_object || !msg?.content) return false;
  const obj = msg.content;
  return obj.ObjectType === MessageObjectType.PrivateChatFile || obj.ObjectType === MessageObjectType.GroupChatFile;
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
const MessageBubble = React.memo(function MessageBubble({ message, mode, selfAddress, contactMap, fileDownloadStatus, onFileTap }) {
  const senderField = mode === 'group' ? 'address' : 'sour';
  const senderAddress = message[senderField] || '';
  const isSelf = senderAddress === selfAddress;

  const content = extractContent(message);
  const fileStatus = fileDownloadStatus?.[getMessageKey(message)];

  return (
    <View className={`flex-row ${isSelf ? 'flex-row-reverse' : ''} mb-3`}>
      {/* Sender avatar */}
      <AvatarImage
        address={senderAddress}
        nickname={!isSelf ? resolveName(senderAddress, contactMap) : undefined}
        size={32}
        style={{ marginLeft: isSelf ? 8 : undefined, marginRight: !isSelf ? 8 : undefined }}
      />

      <View className={`max-w-[75%] ${isSelf ? 'items-end' : 'items-start'}`}>
        {/* Sender name (group mode, or when not self) */}
        {!isSelf && mode === 'group' && (
          <Text className="text-xs text-text-secondary/70 mb-1 ml-1">
            {resolveName(senderAddress, contactMap)}
          </Text>
        )}

        {/* Bubble */}
        <View
          className={`px-3 py-2 rounded-2xl ${
            isSelf
              ? 'bg-primary/30 rounded-tr-sm'
              : 'bg-surface-alt rounded-tl-sm border border-secondary-light/20'
          }`}
        >
          {/* File message — tappable with download status */}
          {isFileMessage(message) ? (
            <TouchableOpacity
              onPress={() => onFileTap?.(message)}
              activeOpacity={0.6}
              disabled={fileStatus === 'downloading'}
            >
              <View className="flex-row items-center gap-2">
                <Ionicons
                  name={fileStatus === 'saved' ? "checkmark-circle" : "document-attach"}
                  size={16}
                  color={fileStatus === 'saved' ? '#22c55e' : fileStatus === 'downloading' ? '#f59e0b' : '#a89f85'}
                />
                <Text className="text-base text-text-primary">
                  {content}
                </Text>
                {message.content?.Size > 0 && (
                  <Text className="text-xs text-text-secondary/60">
                    ({formatFileSize(message.content.Size)})
                  </Text>
                )}
                {fileStatus === 'downloading' && (
                  <Text className="text-xs text-warning">Downloading...</Text>
                )}
              </View>

              {/* Timestamp */}
              <Text className="text-[10px] text-text-secondary/50 mt-1">
                {formatTime(message.signed_at)}
              </Text>
            </TouchableOpacity>
          ) : (
            <>
              {/* Message content */}
              {content ? (
                <Text className="text-base text-text-primary whitespace-pre-wrap break-words">
                  {content}
                </Text>
              ) : (
                <Text className="text-sm text-text-secondary/50 italic">
                  [Empty message]
                </Text>
              )}

              {/* Timestamp */}
              <Text className="text-[10px] text-text-secondary/50 mt-1">
                {formatTime(message.signed_at)}
              </Text>
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
function ChatInfoModal({ visible, session, mode, onClose }) {
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
        if (mode === 'private') {
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
          const filtered = Array.isArray(members) ? members.filter(m => m !== selfAddress) : [];
          if (!isMounted) return;
          setInfo({ members: filtered });
        }
      } catch (e) {
        console.error('[ChatInfoModal] failed to load info:', e.message);
      } finally {
        if (isMounted) setLoading(false);
      }
    })();

    return () => { isMounted = false; };
  }, [visible, session, mode, selfAddress, groupMembers]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View className="flex-1 bg-black/45 justify-center items-center px-6">
        <View className="w-full max-w-sm bg-white rounded-2xl p-5">
          {/* Header */}
          <View className="flex-row items-center justify-between mb-4">
            <Text className="text-lg font-bold text-text-primary">
              {mode === 'private' ? 'Contact Info' : 'Group Info'}
            </Text>
            <TouchableOpacity onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={24} color="#999" />
            </TouchableOpacity>
          </View>

          {loading ? (
            <View className="items-center py-8">
              <Ionicons name="hourglass" size={32} color="#d4c8a8" />
              <Text className="text-sm text-text-secondary mt-2">Loading...</Text>
            </View>
          ) : mode === 'private' ? (
            /* Private chat info */
            <View>
              {/* Contact name + address */}
              <View className="mb-3">
                <Text className="text-xs text-text-secondary/60 mb-1">Contact</Text>
                <Text className="text-base font-semibold text-text-primary">
                  {resolveName(session.remote || session.address, contactMap)}
                </Text>
              </View>
              <View className="mb-3">
                <Text className="text-xs text-text-secondary/60 mb-1">Address</Text>
                <Text className="text-sm text-text-primary font-mono" numberOfLines={1}>
                  {session.remote || session.address}
                </Text>
              </View>

              {/* Follow status */}
              <View className="flex-row items-center justify-between py-2 border-t border-secondary-light/20">
                <Text className="text-sm text-text-primary">Following</Text>
                <View className="flex-row items-center gap-1.5">
                  <Ionicons
                    name={info?.follow ? "checkmark-circle" : "close-circle-outline"}
                    size={18}
                    color={info?.follow ? '#22c55e' : '#999'}
                  />
                  <Text className={`text-sm ${info?.follow ? 'text-status-success' : 'text-text-secondary/60'}`}>
                    {info?.follow ? 'Yes' : 'No'}
                  </Text>
                </View>
              </View>

              {/* Friend status */}
              <View className="flex-row items-center justify-between py-2 border-t border-secondary-light/20">
                <Text className="text-sm text-text-primary">Friend</Text>
                <View className="flex-row items-center gap-1.5">
                  <Ionicons
                    name={info?.friend ? "checkmark-circle" : "close-circle-outline"}
                    size={18}
                    color={info?.friend ? '#22c55e' : '#999'}
                  />
                  <Text className={`text-sm ${info?.friend ? 'text-status-success' : 'text-text-secondary/60'}`}>
                    {info?.friend ? 'Yes' : 'No'}
                  </Text>
                </View>
              </View>

              {/* ECDH handshake status */}
              <View className="flex-row items-center justify-between py-2 border-t border-secondary-light/20">
                <Text className="text-sm text-text-primary">ECDH Handshake</Text>
                <View className="flex-row items-center gap-1.5">
                  <Ionicons
                    name={session.aes_key !== undefined ? "checkmark-circle" : "time-outline"}
                    size={18}
                    color={session.aes_key !== undefined ? '#22c55e' : '#f59e0b'}
                  />
                  <Text className={`text-sm ${session.aes_key !== undefined ? 'text-status-success' : 'text-warning'}`}>
                    {session.aes_key !== undefined ? 'Established' : 'Pending'}
                  </Text>
                </View>
              </View>
            </View>
          ) : (
            /* Group chat info */
            <View>
              {/* Group name */}
              <View className="mb-3">
                <Text className="text-xs text-text-secondary/60 mb-1">Group Name</Text>
                <Text className="text-base font-semibold text-text-primary">
                  {session.name || 'Group'}
                </Text>
              </View>

              {/* Group hash */}
              <View className="mb-3">
                <Text className="text-xs text-text-secondary/60 mb-1">Group Hash</Text>
                <Text className="text-xs text-text-primary font-mono" numberOfLines={2}>
                  {session.hash}
                </Text>
              </View>

              {/* Member count */}
              <View className="mb-2">
                <Text className="text-xs text-text-secondary/60 mb-1">
                  Members ({info?.members?.length || 0})
                </Text>
              </View>

              {/* Member list */}
              <View className="max-h-[300px] overflow-y-auto">
                {info?.members?.map((member, idx) => (
                  <View key={member || `member-${idx}`} className="flex-row items-center gap-2 py-1.5">
                    <Ionicons name="person" size={16} color="#a89f85" />
                    <Text className="text-sm text-text-primary flex-1" numberOfLines={1}>
                      {resolveName(member, contactMap)}
                    </Text>
                    <Text className="text-[10px] text-text-secondary/50 font-mono" numberOfLines={1}>
                      {shortenAddress(member)}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Close button */}
          <TouchableOpacity
            onPress={onClose}
            activeOpacity={0.6}
            className="mt-4 bg-primary/20 rounded-xl py-3 items-center"
          >
            <Text className="text-sm font-semibold text-text-primary">Close</Text>
          </TouchableOpacity>
        </View>
      </View>
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
  const { session } = route.params;
  const dispatch = useDispatch();

  const currentSession = useSelector(selectCurrentSession);
  const messages = useSelector(selectCurrentSessionMessages);
  const selfAddress = useSelector(selectUserAddress);
  const contactMap = useSelector(selectContactMap);
  const isConnected = useSelector(selectMessengerConnStatus);

  const [inputText, setInputText] = useState('');
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [fileDownloadStatus, setFileDownloadStatus] = useState({});
  const refreshingRef = useRef(false);
  const flatListRef = useRef(null);

  // Determine if this is private or group
  const mode = session.type === SessionType.Group ? 'group' : 'private';

  // Session display name
  let sessionName = '';
  if (session.type === SessionType.Private) {
    sessionName = resolveName(session.remote || session.address, contactMap);
  } else {
    sessionName = session.name || 'Group';
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
    setInputText('');
  }, [inputText, dispatch]);

  const handleRefresh = useCallback(() => {
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    dispatch(LoadCurrentSession(session));
    setTimeout(() => { refreshingRef.current = false; }, 3000);
  }, [dispatch, session]);

  const handleBack = useCallback(() => {
    dispatch(LoadSessionList());
    navigation.goBack();
  }, [navigation, dispatch]);

  const handleAttach = useCallback(async () => {
    const result = await pickFile();
    if (!result) return;
    dispatch(SendFile({ file_uri: result.uri }));
  }, [dispatch]);

  const handleFileTap = useCallback(async (message) => {
    const fileHash = message.content?.Hash;
    if (!fileHash) return;

    // Check current file status in DB
    const existingFile = await dbAPI.getFileByHash(fileHash);
    const msgKey = getMessageKey(message);

    if (existingFile?.is_saved) {
      // File already saved locally, trigger SaveChatFile to copy to shared location
      setFileDownloadStatus(prev => ({ ...prev, [msgKey]: 'saved' }));
      dispatch(SaveChatFile({
        hash: fileHash,
        name: message.content.Name || 'file',
        ext: message.content.Ext || '',
      }));
    } else {
      // Start downloading
      setFileDownloadStatus(prev => ({ ...prev, [msgKey]: 'downloading' }));
      dispatch(FetchChatFile({
        hash: fileHash,
        size: message.content.Size,
      }));
    }
  }, [dispatch]);

  const renderMessage = useCallback(({ item }) => (
    <MessageBubble
      message={item}
      mode={mode}
      selfAddress={selfAddress}
      contactMap={contactMap}
      fileDownloadStatus={fileDownloadStatus}
      onFileTap={handleFileTap}
    />
  ), [mode, selfAddress, contactMap, fileDownloadStatus, handleFileTap]);

  const keyExtractor = useCallback((item) => {
    return item.hash || `msg-${item.sequence}-${item.signed_at}`;
  }, []);

  // Determine if AES key is ready (can send messages)
  const canSend = currentSession?.aes_key !== undefined || mode === 'group';

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}
      className="flex-1 bg-surface"
    >
      {/* Header */}
      <View className="flex-row items-center px-3 py-2 bg-primary/5 border-b border-secondary-light/30">
        <TouchableOpacity onPress={handleBack} activeOpacity={0.6}>
          <Ionicons name="arrow-back" size={24} color="#1a1a2e" />
        </TouchableOpacity>

        <View className="flex-row items-center flex-1 ml-2">
          {/* Session avatar */}
          <View className={`w-9 h-9 rounded-full items-center justify-center ${
            mode === 'group' ? 'bg-secondary/40' : 'bg-primary/30'
          }`}>
            {mode === 'group' ? (
              <Ionicons name="people" size={18} color="#8a7a5a" />
            ) : (
              <Text className="text-xs font-bold text-text-primary">
                {getInitials(session.remote || session.address)}
              </Text>
            )}
          </View>

          <View className="ml-2">
            <Text className="text-base font-semibold text-text-primary" numberOfLines={1}>
              {sessionName}
            </Text>
            <View className="flex-row items-center">
              <View className={`w-1.5 h-1.5 rounded-full ${
                isConnected ? 'bg-status-success' : 'bg-status-error'
              }`} />
              <Text className="text-[10px] text-text-secondary/60 ml-1">
                {isConnected ? 'Online' : 'Offline'}
              </Text>
            </View>
          </View>
        </View>

        {/* Info button */}
        <TouchableOpacity onPress={() => setShowInfoModal(true)} activeOpacity={0.6}>
          <Ionicons name="information-circle-outline" size={22} color="#a89f85" />
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
            refreshing={refreshingRef.current}
            onRefresh={handleRefresh}
            tintColor="#e6b420"
          />
        }
        ListEmptyComponent={
          <View className="flex-1 items-center justify-center py-10">
            <Ionicons name="chatbubble-ellipses-outline" size={48} color="#d4c8a8" />
            <Text className="text-base text-text-secondary mt-3">
              No messages yet
            </Text>
            {!canSend && mode !== 'group' && (
              <Text className="text-xs text-text-secondary/50 mt-1 italic">
                Waiting for handshake...
              </Text>
            )}
          </View>
        }
      />

      {/* Input bar */}
      <View className="flex-row items-center px-3 py-2 bg-surface-alt border-t border-secondary-light/30">
        {/* Attach file button → pickFile() → SendFile saga */}
        <TouchableOpacity onPress={handleAttach} activeOpacity={0.6}>
          <Ionicons name="attach" size={24} color="#a89f85" />
        </TouchableOpacity>

        {/* Text input */}
        <TextInput
          value={inputText}
          onChangeText={setInputText}
          placeholder="Type a message..."
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
              ? 'bg-primary'
              : 'bg-secondary-light/40'
          }`}
        >
          <Ionicons
            name="send"
            size={20}
            color={inputText.trim() && canSend ? '#ffffff' : '#a89f85'}
          />
        </TouchableOpacity>
      </View>

      {/* Chat Info Modal */}
      <ChatInfoModal
        visible={showInfoModal}
        session={activeSession}
        mode={mode}
        onClose={() => setShowInfoModal(false)}
      />
    </KeyboardAvoidingView>
  );
}
