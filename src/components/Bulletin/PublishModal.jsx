import React, { useState, useCallback, useEffect, useRef } from "react";
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Dimensions,
} from "react-native";
import { useDispatch, useSelector } from "react-redux";
import { useTranslation } from "react-i18next";

import {
  PublishBulletin,
  BulletinFileAdd,
  BulletinFileDel,
  BulletinQuoteDel,
} from "../../store/sagas/messenger.actions";
import {
  setPublishFlag,
  setPublishTagList,
} from "../../store/slices/MessengerSlice";
import { setFlashNoticeMessage } from "../../store/slices/CommonSlice";
import { FLASH_DURATION_MS } from "../../lib/AppConst";
import { ListItemMax } from "../../lib/MessengerConst";
import { filesize_format } from "../../lib/AppUtil";
import { pickFile } from "../../services/mediaPicker";
import { ACCENT } from "../../lib/theme";
import useDarkMode from "../../hooks/useDarkMode";

const MAX_CONTENT_LENGTH = 2000;

/**
 * PublishModal — bottom-sheet modal for composing a new bulletin post.
 *
 * Features:
 *   - Content textarea with character counter (max 2000)
 *   - Tag chips: type a tag name, press Enter (keyboard return-key) or tap "+" to add
 *   - Tap a chip to remove it; max {ListItemMax} tags
 *   - File attachment: picks image/document, dispatches BulletinFileAdd saga
 *   - Shows attached files as removable chips with file size
 *   - Submit clears local publish state and dispatches PublishBulletin saga
 */
export default function PublishModal({ visible, onClose }) {
  const { t } = useTranslation();
  const { isDark } = useDarkMode();
  const dispatch = useDispatch();
  const publishTags = useSelector((state) => state.Messenger.PublishTagList);
  const publishFiles = useSelector((state) => state.Messenger.PublishFileList);
  const publishQuotes = useSelector(
    (state) => state.Messenger.PublishQuoteList,
  );

  const [content, setContent] = useState("");
  const s = styles(isDark);
  const [tagInput, setTagInput] = useState("");
  const contentRef = useRef(null);

  // Track keyboard height manually. KeyboardAvoidingView's `behavior` is
  // unreliable inside a Modal on Android (adjustResize is activity-level and
  // often doesn't reach the dialog; KAV padding measures 0), so the sheet
  // stayed behind the keyboard. Measuring via Keyboard events is deterministic
  // on both platforms.
  const [kbHeight, setKbHeight] = useState(0);
  useEffect(() => {
    // Bulletproof height extraction: some IMEs/versions report the height
    // under different keys, so fall back to computing it from screenY.
    const readHeight = (e) => {
      if (!e) return 0;
      const end = e.endCoordinates || e;
      if (end && typeof end.height === "number" && end.height > 0) {
        return end.height;
      }
      if (end && typeof end.screenY === "number") {
        const { height: sh } = Dimensions.get("window");
        return Math.max(sh - end.screenY, 0);
      }
      return 0;
    };
    const showSub = Keyboard.addListener("keyboardDidShow", (e) => {
      const h = readHeight(e);
      console.log("[KB-DIAG] keyboardDidShow height=" + h);
      setKbHeight(h);
    });
    const hideSub = Keyboard.addListener("keyboardDidHide", () => {
      console.log("[KB-DIAG] keyboardDidHide");
      setKbHeight(0);
    });
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  // Reset form when modal opens
  useEffect(() => {
    if (visible) {
      setContent("");
      setTagInput("");
      setTimeout(() => contentRef.current?.focus(), 400);
    }
  }, [visible]);

  const handleClose = useCallback(() => {
    dispatch(setPublishFlag(false));
    onClose?.();
  }, [dispatch, onClose]);

  const handleAddTag = useCallback(() => {
    const trimmed = tagInput.trim();
    if (!trimmed) return;
    if (publishTags.length >= ListItemMax) {
      dispatch(
        setFlashNoticeMessage({
          message: `Maximum ${ListItemMax} tags allowed.`,
          duration: FLASH_DURATION_MS,
        }),
      );
      return;
    }
    // Dispatch to Redux directly for instant UI feedback.
    // BulletinTagAdd saga also deduplicates and enforces max length when called from other paths.
    dispatch(setPublishTagList([...publishTags, trimmed]));
    setTagInput("");
  }, [dispatch, publishTags, tagInput]);

  const handleRemoveTag = useCallback(
    (tagToRemove) => {
      const updated = publishTags.filter((t) => t !== tagToRemove);
      dispatch(setPublishTagList(updated));
    },
    [dispatch, publishTags],
  );

  const handleFileAttach = useCallback(async () => {
    const result = await pickFile();
    if (!result) return;
    dispatch(BulletinFileAdd({ file_uri: result.uri }));
  }, [dispatch]);

  const handleRemoveFile = useCallback(
    (fileHash) => {
      dispatch(BulletinFileDel({ Hash: fileHash }));
    },
    [dispatch],
  );

  const handleRemoveQuote = useCallback(
    (hash) => {
      dispatch(BulletinQuoteDel({ Hash: hash }));
    },
    [dispatch],
  );

  const handleSubmit = useCallback(() => {
    if (!content.trim()) {
      dispatch(
        setFlashNoticeMessage({
          message: t("chat.content_empty"),
          duration: FLASH_DURATION_MS,
        }),
      );
      return;
    }
    dispatch(PublishBulletin({ content: content.trim() }));
    handleClose();
  }, [content, dispatch, handleClose]);

  const canSubmit =
    content.trim().length > 0 && publishTags.length <= ListItemMax;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1, height: Dimensions.get("window").height }}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.45)",
            justifyContent: "flex-end",
            // Android: the Modal is a separate window that adjustResize does
            // not shrink, so we push the sheet up manually from the measured
            // keyboard height. iOS uses KAV padding above.
            paddingBottom: Platform.OS === "android" ? kbHeight : 0,
          }}
        >
          <View style={s.container}>
            {/* Drag indicator */}
            <View style={s.dragIndicator} />

            {/* Header */}
            <View style={s.header}>
              <Text style={s.headerTitle}>{t("ui.new_bulletin")}</Text>
              <TouchableOpacity onPress={handleClose} hitSlop={10}>
                <Text style={s.closeBtn}>{t("common.cancel")}</Text>
              </TouchableOpacity>
            </View>

            {/* Content area */}
            <ScrollView
              style={s.body}
              contentContainerStyle={s.bodyContent}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
            >
              {/* Textarea */}
              <TextInput
                ref={contentRef}
                multiline
                numberOfLines={8}
                placeholder={t("ui.write_bulletin")}
                placeholderTextColor="#999"
                value={content}
                onChangeText={setContent}
                maxLength={MAX_CONTENT_LENGTH}
                style={s.textarea}
              />
              <Text style={s.charCount}>
                {content.length} / {MAX_CONTENT_LENGTH}
              </Text>

              {/* Tag section */}
              <View style={s.tagSection}>
                <Text style={s.sectionLabel}>
                  {t("ui.tags_max", { max: ListItemMax })}
                </Text>

                {/* Tag chips */}
                {publishTags.length > 0 && (
                  <View style={s.chipRow}>
                    {publishTags.map((tag) => (
                      <TouchableOpacity
                        key={tag}
                        style={s.chip}
                        onPress={() => handleRemoveTag(tag)}
                        activeOpacity={0.6}
                      >
                        <Text style={s.chipText}>{tag}</Text>
                        <Text style={s.chipRemove}> ✕</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}

                {/* Tag input row */}
                <View style={s.tagInputRow}>
                  <TextInput
                    placeholder={t("ui.type_tag_name")}
                    placeholderTextColor="#999"
                    value={tagInput}
                    onChangeText={setTagInput}
                    onSubmitEditing={handleAddTag}
                    returnKeyType="done"
                    style={s.tagInput}
                  />
                  <TouchableOpacity
                    onPress={handleAddTag}
                    disabled={!tagInput.trim()}
                    style={[
                      s.tagAddBtn,
                      !tagInput.trim() && s.tagAddBtnDisabled,
                    ]}
                    hitSlop={8}
                  >
                    <Text style={s.tagAddText}>+</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Quote section */}
              {publishQuotes.length > 0 && (
                <View style={s.tagSection}>
                  <Text style={s.sectionLabel}>
                    Quoted Bulletins ({publishQuotes.length})
                  </Text>
                  <View style={s.chipRow}>
                    {publishQuotes.map((quote) => (
                      <TouchableOpacity
                        key={quote.Hash}
                        style={[s.chip, s.quoteChip]}
                        onPress={() => handleRemoveQuote(quote.Hash)}
                        activeOpacity={0.6}
                      >
                        <Text style={s.chipText} numberOfLines={1}>
                          🔗 #{quote.Sequence} {quote.Address.slice(0, 6)}...
                        </Text>
                        <Text style={s.chipRemove}> ✕</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}

              {/* File attachments */}
              {publishFiles.length > 0 && (
                <View>
                  <Text style={s.sectionLabel}>{t("ui.attachments")}</Text>
                  <View style={s.chipRow}>
                    {publishFiles.map((file) => (
                      <TouchableOpacity
                        key={file.Hash}
                        style={[s.chip, s.fileChip]}
                        onPress={() => handleRemoveFile(file.Hash)}
                        activeOpacity={0.6}
                      >
                        <Text style={s.chipText} numberOfLines={1}>
                          {file.Name || "file"} ({filesize_format(file.Size)})
                        </Text>
                        <Text style={s.chipRemove}> ✕</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}

              <TouchableOpacity
                onPress={handleFileAttach}
                style={s.attachBtn}
                activeOpacity={0.7}
              >
                <Text style={s.attachIcon}>📎</Text>
                <Text style={s.attachText}>{t("ui.attach_file")}</Text>
              </TouchableOpacity>
            </ScrollView>

            {/* Footer */}
            <View style={s.footer}>
              <TouchableOpacity
                onPress={handleSubmit}
                disabled={!canSubmit}
                style={[s.publishBtn, !canSubmit && s.publishBtnDisabled]}
                activeOpacity={0.7}
              >
                <Text style={s.publishText}>{t("ui.publish")}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = (isDark) =>
  StyleSheet.create({
    container: {
      backgroundColor: isDark ? "#2a2a34" : "#fff",
      borderRadius: 20,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      maxHeight: "85%",
      paddingBottom: Platform.OS === "ios" ? 30 : 20,
    },
    dragIndicator: {
      width: 40,
      height: 5,
      backgroundColor: isDark ? "#4a4a55" : "#ccc",
      borderRadius: 3,
      alignSelf: "center",
      marginTop: 10,
      marginBottom: 6,
    },
    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingHorizontal: 20,
      paddingBottom: 12,
      borderBottomWidth: 1,
      borderBottomColor: isDark ? "#3a3a45" : "#f0e6c0",
    },
    headerTitle: {
      fontSize: 18,
      fontWeight: "700",
      color: isDark ? "#e8e8ec" : "#333",
    },
    closeBtn: {
      fontSize: 16,
      color: "#999",
    },
    body: {
      // flex:1 在只有 maxHeight（无确定高度）的父容器里会塌缩成 0，
      // 导致输入框/标签/附件全部不可见。改用确定高度让 ScrollView 正常撑开。
      height: 380,
    },
    bodyContent: {
      paddingHorizontal: 20,
      paddingTop: 14,
      gap: 14,
    },
    textarea: {
      minHeight: 140,
      maxHeight: 220,
      padding: 12,
      borderWidth: 1,
      borderColor: isDark ? "#4a4a55" : "#e6d8a8",
      borderRadius: 10,
      fontSize: 16,
      textAlignVertical: "top",
      backgroundColor: isDark ? "#1e1e28" : "#fffdf5",
    },
    charCount: {
      position: "absolute",
      right: 20,
      bottom: Platform.OS === "ios" ? -28 : -22,
      fontSize: 11,
      color: isDark ? "#777" : "#bbb",
    },
    tagSection: {
      marginTop: 10,
    },
    sectionLabel: {
      fontSize: 13,
      fontWeight: "600",
      color: isDark ? "#999" : "#888",
      marginBottom: 6,
    },
    chipRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 6,
      marginBottom: 8,
    },
    chip: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: isDark ? "#3a3520" : "#fdf6d3",
      borderWidth: 1,
      borderColor: isDark ? "#5a5030" : "#e6d07a",
      borderRadius: 16,
      paddingHorizontal: 12,
      paddingVertical: 4,
    },
    chipText: {
      fontSize: 13,
      color: isDark ? "#d4c8a8" : "#8a7415",
      fontWeight: "500",
    },
    chipRemove: {
      fontSize: 13,
      color: isDark ? "#c4b060" : "#b8960e",
    },
    fileChip: {
      maxWidth: "85%",
    },
    tagInputRow: {
      flexDirection: "row",
      gap: 8,
    },
    tagInput: {
      flex: 1,
      borderWidth: 1,
      borderColor: isDark ? "#4a4a55" : "#ddd",
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 8,
      fontSize: 14,
    },
    tagAddBtn: {
      justifyContent: "center",
      alignItems: "center",
      width: 36,
      backgroundColor: ACCENT,
      borderRadius: 8,
    },
    tagAddBtnDisabled: {
      backgroundColor: isDark ? "#3a3a45" : "#ddd",
    },
    tagAddText: {
      fontSize: 20,
      fontWeight: "700",
      color: "#fff",
      marginTop: -3,
    },
    attachBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingVertical: 10,
      paddingHorizontal: 14,
      backgroundColor: isDark ? "#2e2e38" : "#f9f5e8",
      borderRadius: 10,
      borderWidth: 1,
      borderColor: isDark ? "#4a4a55" : "#e6d8a8",
    },
    attachIcon: {
      fontSize: 18,
    },
    attachText: {
      fontSize: 13,
      color: "#999",
      fontStyle: "italic",
    },
    footer: {
      flexDirection: "row",
      justifyContent: "center",
      paddingTop: 16,
      borderTopWidth: 1,
      borderTopColor: isDark ? "#3a3a45" : "#f0e6c0",
    },
    publishBtn: {
      backgroundColor: ACCENT,
      borderRadius: 12,
      paddingVertical: 14,
      paddingHorizontal: 50,
    },
    publishBtnDisabled: {
      backgroundColor: isDark ? "#3a3a45" : "#ccc",
    },
    publishText: {
      fontSize: 16,
      fontWeight: "700",
      color: "#fff",
      textAlign: "center",
    },
  });
