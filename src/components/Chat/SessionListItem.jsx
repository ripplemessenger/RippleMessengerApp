import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import Ionicons from "react-native-vector-icons/Ionicons";
import { useTranslation } from "react-i18next";
import { SessionType } from "../../lib/AppConst";
import { formatTime, truncate, shortenAddress } from "../../lib/format";
import AvatarImage from "../AvatarImage";

/**
 * Extract a text preview from a message that may be plain text or an object.
 * Truncates to 40 chars for display in session list.
 */
function getMessagePreview(msg, t, selfAddress, contactMap) {
  if (!msg) return "";
  if (msg.is_object && msg.content) {
    const obj = msg.content;
    if (obj.Name) {
      return t("chat.attached") + " " + truncate(obj.Name, 30);
    }
    if (obj.ObjectType !== undefined) {
      if (obj.ObjectType === 101) {
        const addr = obj.Address || obj.address || "";
        const seq = obj.Sequence || obj.sequence || 0;
        let name = "";
        if (addr) {
          if (selfAddress && addr === selfAddress) name = t("common.me");
          else if (contactMap && contactMap[addr]) name = contactMap[addr];
          else name = shortenAddress(addr);
        }
        return name ? `${name}#${seq}` : t("chat.shared_bulletin");
      }
      return t("chat.shared_file");
    }
  }
  const text = typeof msg.content === "string" ? msg.content : "";
  return truncate(text, 40);
}

/**
 * Build the secondary preview line for a session.
 * Shows "Sender: message" for groups, "message" for private chats.
 * Falls back to member count for empty group sessions only.
 */
function buildSessionPreview(session, t, selfAddress, contactMap) {
  const lastMsg = session.last_message;

  // When there are messages, always show content preview
  if (lastMsg) {
    const preview = getMessagePreview(lastMsg, t, selfAddress, contactMap);

    // For group chats, prefix with sender address
    if (session.type === 1) {
      const senderAddr = lastMsg.address || "";
      const senderShort = shortenAddress(senderAddr);
      return preview
        ? `${senderShort}: ${preview}`
        : `${session.member?.length || 0} ${t("chat.group_members")}`;
    }

    // Private chat — message content, or fallback to member hint
    return preview || "";
  }

  // No messages at all yet
  if (session.new_msg_count > 0) {
    return `${session.new_msg_count} ${t("chat.new_message")}${session.new_msg_count > 1 ? "s" : ""}`;
  }

  // Truly empty session — show member count for groups only
  if (session.type === 1) {
    return `${session.member?.length || 0} ${t("chat.group_members")}`;
  }

  return "";
}

/**
 * SessionListItem — renders one chat session (friend or group).
 *
 * @param {object} props
 * @param {object} props.session - Session object from LoadSessionList saga
 * @param {function} props.onPress - Callback when session is tapped
 * @param {object} props.contactMap - Map of address -> contact info (for nicknames)
 * @param {string} props.selfAddress - Current user's XRPL address
 */
export default React.memo(function SessionListItem({
  session,
  onPress,
  contactMap = {},
  selfAddress = "",
}) {
  const { t } = useTranslation();
  const isPrivate = session.type === SessionType.Private;
  const isNewMessages = session.new_msg_count > 0;

  // Resolve display name
  let displayName = "";
  if (isPrivate) {
    const nickname = contactMap[session.address];
    displayName = nickname || truncate(session.address, 12);
  } else {
    displayName = session.name || t("group.unnamed");
  }

  // Get last message preview - check if it's a bulletin link
  const lastMsg = session.last_message;
  const isBulletinLink =
    lastMsg?.is_object && lastMsg?.content?.ObjectType === 101;
  let bulletinLinkText = "";
  if (isBulletinLink) {
    const obj = lastMsg.content;
    const addr = obj.Address || obj.address || "";
    const seq = obj.Sequence || obj.sequence || 0;
    let name = "";
    if (addr) {
      if (selfAddress && addr === selfAddress) name = t("common.me");
      else if (contactMap && contactMap[addr]) name = contactMap[addr];
      else name = shortenAddress(addr);
    }
    bulletinLinkText = name ? `${name}#${seq}` : t("chat.shared_bulletin");
  }
  const previewText = isBulletinLink
    ? ""
    : buildSessionPreview(session, t, selfAddress, contactMap);

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.6}
      className={`flex-row items-center px-4 py-3 ${
        isNewMessages ? "bg-primary/5" : "bg-transparent"
      } border-b border-secondary-light/20`}
    >
      {/* Avatar */}
      <View className="relative">
        {isPrivate ? (
          <AvatarImage
            address={session.address}
            nickname={contactMap[session.address]}
            size={48}
          />
        ) : (
          <View className="w-12 h-12 rounded-full bg-secondary/40 items-center justify-center">
            <Ionicons name="people" size={22} color="#8a7a5a" />
          </View>
        )}
        {/* Unread badge */}
        {isNewMessages && (
          <View className="absolute -top-1 -right-1 w-5 h-5 bg-status-error rounded-full items-center justify-center">
            <Text className="text-xs font-bold text-white">
              {session.new_msg_count > 99 ? "99+" : session.new_msg_count}
            </Text>
          </View>
        )}
      </View>

      {/* Session info */}
      <View className="flex-1 ml-3 min-w-0">
        <View className="flex-row items-center justify-between">
          <Text
            className={`text-base font-semibold text-text-primary ${
              isNewMessages ? "font-bold" : ""
            }`}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {displayName}
          </Text>
          <Text className="text-xs text-text-secondary/60 ml-2">
            {formatTime(session.updated_at)}
          </Text>
        </View>
        {isBulletinLink ? (
          <View className="mt-0.5 px-2 py-0.5 rounded-full border border-primary/30 bg-primary/5 self-start">
            <Text className="text-sm text-primary-dark">
              {bulletinLinkText}
            </Text>
          </View>
        ) : (
          <Text
            className="text-sm text-text-secondary mt-0.5"
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {previewText ||
              (isPrivate
                ? ""
                : `${session.member?.length || 0} ${t("chat.group_members")}`)}
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );
});
