import React, { useCallback } from "react";
import { View, Text, Image, StyleSheet } from "react-native";
import Ionicons from "react-native-vector-icons/Ionicons";

import { CheckAvatar } from "../store/sagas/messenger.actions";
import { useDispatch } from "react-redux";
import { useAvatarData } from "../hooks/useAvatarData";

interface AvatarImageProps {
  /** XRPL address to look up avatar for */
  address?: string | null;
  /** Nickname or display name (used for initials fallback and accessibility) */
  nickname?: string;
  /** Diameter of the avatar in pixels. Default: 36 */
  size?: number;
  /** Optional press handler */
  onPress?: () => void;
}

/**
 * Get 4-character identifier for avatar fallback.
 * All XRPL addresses start with 'r', so we take chars[1..2] + last 2 chars
 * for better visual distinction. Always uses address, not nickname.
 */
function getInitials(nickname?: string, address?: string): string {
  if (address && address.length >= 4) {
    // rAaa... → take chars at index 1,2 and last 2 chars
    return (
      address[1] +
      address[2] +
      address[address.length - 2] +
      address[address.length - 1]
    );
  }
  if (address && address.length >= 2) return address.slice(0, 2);
  if (nickname && nickname.length >= 2) return nickname.slice(0, 2);
  return "?";
}

const COLORS = [
  "#e6b420", // primary gold
  "#5b8dee", // blue
  "#e06c75", // red
  "#98c379", // green
  "#c678dd", // purple
  "#d19a66", // orange
  "#61afef", // light blue
  "#be5046", // dark red
];

function addressToColor(address: string): string {
  let hash = 0;
  for (let i = 0; i < address.length; i++) {
    hash = ((hash << 5) - hash + address.charCodeAt(i)) | 0;
  }
  return COLORS[Math.abs(hash) % COLORS.length];
}

/**
 * AvatarImage — displays a user's avatar image or falls back to initials.
 *
 * On mount, dispatches CheckAvatar to ensure the avatar metadata is in the DB.
 * The hook reads the saved PNG file and converts it to a data URI for React Native Image.
 */
export default function AvatarImage({
  address,
  nickname,
  size = 36,
  onPress,
}: AvatarImageProps) {
  const dispatch = useDispatch();
  const avatarUri = useAvatarData(address);

  // Dispatch CheckAvatar once when address changes
  React.useEffect(() => {
    if (address) {
      // @ts-ignore - createAction payload type not inferred from JS module
      dispatch(CheckAvatar({ address }));
    }
  }, [address, dispatch]);

  const initials = getInitials(nickname, address || undefined);
  const bgColor = address ? addressToColor(address) : "#a89f85";

  return (
    <View
      style={[styles.container, { width: size, height: size }]}
      onTouchEnd={onPress}
    >
      {avatarUri ? (
        <Image
          source={{ uri: avatarUri }}
          style={[styles.image, { width: size, height: size }]}
          resizeMode="cover"
          accessibilityLabel={`Avatar for ${nickname || address || "user"}`}
        />
      ) : (
        <View
          style={[
            styles.fallback,
            {
              width: size,
              height: size,
              borderRadius: size / 2,
              backgroundColor: `${bgColor}30`,
            },
          ]}
          accessibilityLabel={`Avatar for ${nickname || address || "user"}`}
        >
          <Text
            style={[
              styles.initials,
              { fontSize: size * 0.38, lineHeight: size * 0.42 },
            ]}
          >
            {" "}
            {initials.slice(0, 2)}
            {"\n"}
            {initials.slice(2, 4)}{" "}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexShrink: 0,
    overflow: "hidden",
  },
  image: {
    borderRadius: 999,
  },
  fallback: {
    alignItems: "center",
    justifyContent: "center",
  },
  initials: {
    fontWeight: "700",
    color: "#e6b420",
  },
});
