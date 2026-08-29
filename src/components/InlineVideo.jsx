import React, { useEffect, useState } from "react";
import { View, TouchableOpacity, Text } from "react-native";
import { useSelector } from "react-redux";
import Video from "react-native-video";
import Ionicons from "react-native-vector-icons/Ionicons";

import { dbAPI } from "../db";
import * as fileService from "../services/fileService";

const VIDEO_EXT_REGEX = /^\.?(mp4|mov|avi|mkv|webm)$/i;

/**
 * InlineVideo — renders a video thumbnail (first frame) in the chat bubble.
 * Tapping it triggers onPress(uri) to open the full-screen player.
 *
 * Props:
 *   hash  - file hash (local storage key)
 *   ext   - file extension (e.g. ".mp4")
 *   containerStyle - optional wrapper style
 *   onPress - callback(uri) when tapped
 */
export default function InlineVideo({ hash, ext, containerStyle, onPress }) {
  const savedToken = useSelector(
    (state) => state.Messenger.FileSavedMap?.[hash] ?? null,
  );

  const [localUri, setLocalUri] = useState(null);

  useEffect(() => {
    let cancelled = false;
    if (!hash || !ext || !VIDEO_EXT_REGEX.test(ext)) {
      setLocalUri(null);
      return;
    }
    (async () => {
      try {
        const file = await dbAPI.getFileByHash(hash);
        if (cancelled) return;
        if (file && file.is_saved) {
          const path = fileService.getFileFullPath(hash);
          const exists = await fileService.fileExists(path);
          if (!cancelled && exists) {
            const uri = path.startsWith("file://") ? path : `file://${path}`;
            setLocalUri(uri);
            return;
          }
        }
        if (!cancelled) setLocalUri(null);
      } catch {
        if (!cancelled) setLocalUri(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hash, ext, savedToken]);

  if (!localUri) return null;

  const videoEl = (
    <View
      style={{
        width: "100%",
        height: 200,
        borderRadius: 12,
        overflow: "hidden",
        backgroundColor: "#000",
      }}
    >
      <Video
        source={{ uri: localUri }}
        style={{ width: "100%", height: "100%" }}
        paused
        muted
        repeat
        resizeMode="contain"
        progressUpdateInterval={0}
      />
      {/* Play button overlay */}
      <View
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          justifyContent: "center",
          alignItems: "center",
        }}
        pointerEvents="none"
      >
        <View
          style={{
            width: 48,
            height: 48,
            borderRadius: 24,
            backgroundColor: "#00000090",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <Ionicons name="play" size={28} color="#fff" />
        </View>
      </View>
    </View>
  );

  if (!onPress) {
    return <View style={containerStyle}>{videoEl}</View>;
  }

  return (
    <TouchableOpacity
      style={containerStyle}
      onPress={() => onPress(localUri)}
      activeOpacity={0.7}
    >
      {videoEl}
    </TouchableOpacity>
  );
}
