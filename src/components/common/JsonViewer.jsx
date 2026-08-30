import React, { useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Clipboard,
} from "react-native";
import Ionicons from "react-native-vector-icons/Ionicons";
import { useDispatch } from "react-redux";
import { useTranslation } from "react-i18next";
import ModalShell from "./ModalShell";
import { setFlashNoticeMessage } from "../../store/slices/CommonSlice";

/**
 * JsonViewer — unified JSON viewer modal (centered, per component-conventions.md).
 *
 * Replaces the hand-rolled JSON modals that previously diverged:
 *   - BulletinDetailScreen used a BottomSheet (wrong container for a centered dialog)
 *   - ChatDetailScreen used a ModalShell but had no copy button
 * Both now share this component: ModalShell + copy button + monospace code block
 * (theme-aware bg-surface-alt / text-text-primary, works in light and dark).
 *
 * Props:
 *   visible, onClose, title, content (JSON string)
 */
export default function JsonViewer({ visible, onClose, title, content }) {
  const dispatch = useDispatch();
  const { t } = useTranslation();

  const handleCopy = useCallback(() => {
    Clipboard.setString(content || "");
    dispatch(
      setFlashNoticeMessage({
        message: t("common.copied_to_clipboard"),
      }),
    );
  }, [content, dispatch, t]);

  return (
    <ModalShell visible={visible} onClose={onClose} title={title}>
      <View className="flex-row items-center justify-end gap-2">
        <TouchableOpacity
          onPress={handleCopy}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="copy-outline" size={22} color="#a89f85" />
        </TouchableOpacity>
      </View>
      <ScrollView
        style={{ maxHeight: "60%" }}
        contentContainerStyle={{ paddingBottom: 8 }}
      >
        <Text
          className="text-xs font-mono bg-surface-alt text-text-primary p-3 rounded-lg"
          selectable
        >
          {content}
        </Text>
      </ScrollView>
    </ModalShell>
  );
}
