import React, { useRef, useState, useEffect } from "react";
import { View, TouchableOpacity, Animated, Easing } from "react-native";
import Video from "react-native-video";
import Ionicons from "react-native-vector-icons/Ionicons";

/**
 * VideoPlayer — full-screen video player overlay.
 *
 * Controls:
 *   - Tap video → toggle play/pause
 *   - Native video controls (seek, time)
 *   - X button → close
 *
 * Props:
 *   uri      - file:// URI of the video
 *   visible  - whether the player is shown
 *   onClose  - callback when dismissed
 */
export default function VideoPlayer({ uri, visible, onClose }) {
  const videoRef = useRef(null);
  const fade = useRef(new Animated.Value(0)).current;
  const [playing, setPlaying] = useState(true);

  useEffect(() => {
    if (visible) {
      Animated.timing(fade, {
        toValue: 1,
        duration: 200,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start();
      setPlaying(true);
    } else {
      fade.setValue(0);
    }
  }, [visible]);

  if (!visible) return null;

  return (
    <Animated.View
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "#000",
        zIndex: 9999,
        opacity: fade,
      }}
    >
      {/* Video with native controls */}
      <Video
        ref={videoRef}
        source={{ uri }}
        style={{ flex: 1 }}
        paused={!playing}
        resizeMode="contain"
        controls
        onEnd={() => setPlaying(false)}
      />

      {/* Top bar — close button */}
      <View
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          flexDirection: "row",
          justifyContent: "flex-end",
          padding: 16,
        }}
      >
        <TouchableOpacity
          onPress={onClose}
          activeOpacity={0.7}
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            backgroundColor: "#00000080",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <Ionicons name="close" size={22} color="#fff" />
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}
