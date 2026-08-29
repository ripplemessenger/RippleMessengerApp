import React, { useRef, useCallback, useEffect } from "react";
import {
  View,
  Image,
  Animated,
  PanResponder,
  TouchableOpacity,
  Easing,
  Dimensions,
  Text,
} from "react-native";
import Ionicons from "react-native-vector-icons/Ionicons";

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");
const MIN_SCALE = 1.0;
const MAX_SCALE = 5.0;
const DOUBLE_TAP_SCALE = 2.5;

/**
 * ImageViewer — full-screen zoomable image viewer.
 *
 * Gestures:
 *   - Single tap (not zoomed) → close
 *   - Double tap → toggle zoom (1x ↔ 2.5x)
 *   - Pinch → zoom in/out (1x–5x)
 *   - Drag (when zoomed) → pan
 *
 * Props:
 *   uri      - file:// URI of the image
 *   visible  - whether the viewer is shown
 *   onClose  - callback when dismissed
 */
export default function ImageViewer({ uri, visible, onClose }) {
  const scale = useRef(new Animated.Value(1)).current;
  const tx = useRef(new Animated.Value(0)).current;
  const ty = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(0)).current;

  // Mutable state for gesture math
  const state = useRef({
    curScale: 1,
    curTx: 0,
    curTy: 0,
    lastTap: 0,
    pinchDist: 0,
    pinchScale: 1,
    grantX: 0,
    grantY: 0,
    prevX: 0,
    prevY: 0,
    isPanning: false,
  });

  useEffect(() => {
    if (visible) {
      const s = state.current;
      s.curScale = 1;
      s.curTx = 0;
      s.curTy = 0;
      s.lastTap = 0;
      s.pinchDist = 0;
      s.pinchScale = 1;
      s.isPanning = false;
      scale.setValue(1);
      tx.setValue(0);
      ty.setValue(0);
      Animated.timing(fade, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
  }, [visible]);

  const close = useCallback(() => {
    Animated.timing(fade, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start(() => onClose());
  }, [onClose]);

  const animateTo = useCallback(
    (toScale, toTx = 0, toTy = 0, dur = 250) => {
      const s = state.current;
      s.curScale = toScale;
      s.curTx = toTx;
      s.curTy = toTy;
      Animated.parallel([
        Animated.timing(scale, {
          toValue: toScale,
          duration: dur,
          easing: Easing.out(Easing.back(1.2)),
          useNativeDriver: true,
        }),
        Animated.timing(tx, {
          toValue: toTx,
          duration: dur,
          useNativeDriver: true,
        }),
        Animated.timing(ty, {
          toValue: toTy,
          duration: dur,
          useNativeDriver: true,
        }),
      ]).start();
    },
    [scale, tx, ty],
  );

  const getDist = (touches) => {
    if (touches.length < 2) return 0;
    const dx = touches[0].pageX - touches[1].pageX;
    const dy = touches[0].pageY - touches[1].pageY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const clampPan = (s, x, y) => {
    const maxX = (s - 1) * (SCREEN_W / 2);
    const maxY = (s - 1) * (SCREEN_H / 2);
    return {
      x: Math.max(-maxX, Math.min(maxX, x)),
      y: Math.max(-maxY, Math.min(maxY, y)),
    };
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,

      onPanResponderGrant: (evt) => {
        const s = state.current;
        s.grantX = evt.nativeEvent.pageX;
        s.grantY = evt.nativeEvent.pageY;
        s.prevX = evt.nativeEvent.pageX;
        s.prevY = evt.nativeEvent.pageY;
        s.isPanning = false;
        const touches = evt.nativeEvent.touches;
        if (touches && touches.length >= 2) {
          s.pinchDist = getDist(touches);
          s.pinchScale = s.curScale;
        }
      },

      onPanResponderMove: (evt) => {
        const s = state.current;
        const touches = evt.nativeEvent.touches;

        // Pinch zoom (2+ fingers)
        if (touches && touches.length >= 2) {
          const dist = getDist(touches);
          if (s.pinchDist > 0 && dist > 0) {
            const ratio = dist / s.pinchDist;
            const newScale = Math.max(
              MIN_SCALE,
              Math.min(MAX_SCALE, s.pinchScale * ratio),
            );
            s.curScale = newScale;
            scale.setValue(newScale);
            s.pinchDist = dist;
            s.pinchScale = newScale;
          }
          return;
        }

        // Single-finger pan (only when zoomed)
        if (s.curScale > MIN_SCALE + 0.05) {
          const deltaX = evt.nativeEvent.pageX - s.prevX;
          const deltaY = evt.nativeEvent.pageY - s.prevY;
          s.prevX = evt.nativeEvent.pageX;
          s.prevY = evt.nativeEvent.pageY;
          s.isPanning = true;

          const clamped = clampPan(
            s.curScale,
            s.curTx + deltaX,
            s.curTy + deltaY,
          );
          s.curTx = clamped.x;
          s.curTy = clamped.y;
          tx.setValue(clamped.x);
          ty.setValue(clamped.y);
        }
      },

      onPanResponderRelease: (evt) => {
        const s = state.current;

        // If pinch was active, done
        if (s.pinchDist > 0) {
          s.pinchDist = 0;
          return;
        }

        // Tap detection (no significant movement, not panning)
        const dx = Math.abs(evt.nativeEvent.pageX - s.grantX);
        const dy = Math.abs(evt.nativeEvent.pageY - s.grantY);
        const isTap = dx < 10 && dy < 10 && !s.isPanning;

        if (isTap) {
          const now = Date.now();
          if (now - s.lastTap < 300) {
            // Double tap
            s.lastTap = 0;
            if (s.curScale > MIN_SCALE + 0.1) {
              animateTo(1, 0, 0);
            } else {
              animateTo(DOUBLE_TAP_SCALE, 0, 0);
            }
          } else {
            s.lastTap = now;
            setTimeout(() => {
              if (Date.now() - s.lastTap >= 300) {
                if (s.curScale <= MIN_SCALE + 0.1) {
                  close();
                }
              }
            }, 300);
          }
        }

        s.isPanning = false;
      },

      onPanResponderTerminate: () => {
        state.current.pinchDist = 0;
        state.current.isPanning = false;
      },
    }),
  ).current;

  if (!visible) return null;

  return (
    <View
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 9999,
        backgroundColor: "rgba(0,0,0,0.95)",
      }}
    >
      <Animated.View
        style={{
          flex: 1,
          opacity: fade,
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <Animated.Image
          source={{ uri }}
          style={{
            width: SCREEN_W,
            height: SCREEN_H,
            transform: [{ scale }, { translateX: tx }, { translateY: ty }],
          }}
          resizeMode="contain"
          {...panResponder.panHandlers}
        />
      </Animated.View>

      {/* Close button */}
      <TouchableOpacity
        onPress={close}
        style={{
          position: "absolute",
          top: 48,
          right: 16,
          width: 40,
          height: 40,
          borderRadius: 20,
          backgroundColor: "rgba(255,255,255,0.15)",
          justifyContent: "center",
          alignItems: "center",
          zIndex: 10000,
        }}
        activeOpacity={0.7}
      >
        <Ionicons name="close" size={24} color="#fff" />
      </TouchableOpacity>

      {/* Hint */}
      <Text
        style={{
          position: "absolute",
          bottom: 30,
          left: 0,
          right: 0,
          textAlign: "center",
          color: "rgba(255,255,255,0.35)",
          fontSize: 12,
        }}
      >
        Pinch to zoom · Double-tap to toggle · Tap to close
      </Text>
    </View>
  );
}
