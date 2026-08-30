import React, { useState, useEffect, useRef } from "react";
import { View, Text } from "react-native";
import { useSelector } from "react-redux";

/**
 * FlashNotice — global toast that surfaces Common.FlashNoticeMessage.
 *
 * ~30 call sites dispatch setFlashNoticeMessage({ message, duration })
 * (publish success/failure, file saved, forward, new message, quote, etc.).
 * Before this component existed, none of that feedback was ever rendered —
 * it was silently discarded. This overlay reads the state and auto-dismisses
 * after the given duration.
 *
 * Absolutely positioned so it can be mounted once at the navigation root and
 * float above any screen.
 */
export default function FlashNotice() {
  const message = useSelector((state) => state.Common.FlashNoticeMessage);
  const duration = useSelector((state) => state.Common.FlashNoticeDuration);
  const key = useSelector((state) => state.Common.FlashNoticeKey);

  const [visible, setVisible] = useState(false);
  const [text, setText] = useState("");
  const timerRef = useRef(null);

  useEffect(() => {
    if (!message) return;
    setText(message);
    setVisible(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setVisible(false), duration || 3000);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [key]);

  if (!visible) return null;

  return (
    <View
      pointerEvents="none"
      style={{
        position: "absolute",
        top: 64,
        left: 24,
        right: 24,
        zIndex: 9999,
      }}
    >
      <View
        className="bg-surface-card border border-secondary-light/40 rounded-xl py-3 px-4 items-center"
        style={{
          elevation: 8,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 3 },
          shadowOpacity: 0.3,
          shadowRadius: 5,
        }}
      >
        <Text
          className="text-text-primary text-sm text-center"
          numberOfLines={3}
        >
          {text}
        </Text>
      </View>
    </View>
  );
}
