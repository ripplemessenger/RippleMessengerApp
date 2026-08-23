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

import {
  PublishBulletin,
  BulletinFileAdd,
  BulletinFileDel,
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
  const dispatch = useDispatch();
  const publishTags = useSelector((state) => state.Messenger.PublishTagList);
  const publishFiles = useSelector((state) => state.Messenger.PublishFileList);

  const [content, setContent] = useState("");
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

  const handleSubmit = useCallback(() => {
    if (!content.trim()) {
      dispatch(
        setFlashNoticeMessage({
          message: "Content cannot be empty.",
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
          <View style={styles.container}>
            {/* Drag indicator */}
            <View style={styles.dragIndicator} />

            {/* Header */}
            <View style={styles.header}>
              <Text style={styles.headerTitle}>New Bulletin</Text>
              <TouchableOpacity onPress={handleClose} hitSlop={10}>
                <Text style={styles.closeBtn}>Cancel</Text>
              </TouchableOpacity>
            </View>

            {/* Content area */}
            <ScrollView
              style={styles.body}
              contentContainerStyle={styles.bodyContent}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
            >
              {/* Textarea */}
              <TextInput
                ref={contentRef}
                multiline
                numberOfLines={8}
                placeholder="Write your bulletin..."
                placeholderTextColor="#999"
                value={content}
                onChangeText={setContent}
                maxLength={MAX_CONTENT_LENGTH}
                style={styles.textarea}
              />
              <Text style={styles.charCount}>
                {content.length} / {MAX_CONTENT_LENGTH}
              </Text>

              {/* Tag section */}
              <View style={styles.tagSection}>
                <Text style={styles.sectionLabel}>
                  Tags (max {ListItemMax})
                </Text>

                {/* Tag chips */}
                {publishTags.length > 0 && (
                  <View style={styles.chipRow}>
                    {publishTags.map((tag) => (
                      <TouchableOpacity
                        key={tag}
                        style={styles.chip}
                        onPress={() => handleRemoveTag(tag)}
                        activeOpacity={0.6}
                      >
                        <Text style={styles.chipText}>{tag}</Text>
                        <Text style={styles.chipRemove}> ✕</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}

                {/* Tag input row */}
                <View style={styles.tagInputRow}>
                  <TextInput
                    placeholder="Type tag name"
                    placeholderTextColor="#999"
                    value={tagInput}
                    onChangeText={setTagInput}
                    onSubmitEditing={handleAddTag}
                    returnKeyType="done"
                    style={styles.tagInput}
                  />
                  <TouchableOpacity
                    onPress={handleAddTag}
                    disabled={!tagInput.trim()}
                    style={[
                      styles.tagAddBtn,
                      !tagInput.trim() && styles.tagAddBtnDisabled,
                    ]}
                    hitSlop={8}
                  >
                    <Text style={styles.tagAddText}>+</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* File attachments */}
              {publishFiles.length > 0 && (
                <View>
                  <Text style={styles.sectionLabel}>Attached Files</Text>
                  <View style={styles.chipRow}>
                    {publishFiles.map((file) => (
                      <TouchableOpacity
                        key={file.Hash}
                        style={[styles.chip, styles.fileChip]}
                        onPress={() => handleRemoveFile(file.Hash)}
                        activeOpacity={0.6}
                      >
                        <Text style={styles.chipText} numberOfLines={1}>
                          {file.Name || "file"} ({filesize_format(file.Size)})
                        </Text>
                        <Text style={styles.chipRemove}> ✕</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}

              <TouchableOpacity
                onPress={handleFileAttach}
                style={styles.attachBtn}
                activeOpacity={0.7}
              >
                <Text style={styles.attachIcon}>📎</Text>
                <Text style={styles.attachText}>Attach file</Text>
              </TouchableOpacity>
            </ScrollView>

            {/* Footer */}
            <View style={styles.footer}>
              <TouchableOpacity
                onPress={handleSubmit}
                disabled={!canSubmit}
                style={[
                  styles.publishBtn,
                  !canSubmit && styles.publishBtnDisabled,
                ]}
                activeOpacity={0.7}
              >
                <Text style={styles.publishText}>Publish</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#fff",
    borderRadius: 20,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "85%",
    paddingBottom: Platform.OS === "ios" ? 30 : 20,
  },
  dragIndicator: {
    width: 40,
    height: 5,
    backgroundColor: "#ccc",
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
    borderBottomColor: "#f0e6c0",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#333",
  },
  closeBtn: {
    fontSize: 16,
    color: "#999",
  },
  body: {
    flex: 1,
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
    borderColor: "#e6d8a8",
    borderRadius: 10,
    fontSize: 16,
    textAlignVertical: "top",
    backgroundColor: "#fffdf5",
  },
  charCount: {
    position: "absolute",
    right: 20,
    bottom: Platform.OS === "ios" ? -28 : -22,
    fontSize: 11,
    color: "#bbb",
  },
  tagSection: {
    marginTop: 10,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#888",
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
    backgroundColor: "#fdf6d3",
    borderWidth: 1,
    borderColor: "#e6d07a",
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  chipText: {
    fontSize: 13,
    color: "#8a7415",
    fontWeight: "500",
  },
  chipRemove: {
    fontSize: 13,
    color: "#b8960e",
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
    borderColor: "#ddd",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
  },
  tagAddBtn: {
    justifyContent: "center",
    alignItems: "center",
    width: 36,
    backgroundColor: "#e6b420",
    borderRadius: 8,
  },
  tagAddBtnDisabled: {
    backgroundColor: "#ddd",
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
    backgroundColor: "#f9f5e8",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e6d8a8",
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
    borderTopColor: "#f0e6c0",
  },
  publishBtn: {
    backgroundColor: "#e6b420",
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 50,
  },
  publishBtnDisabled: {
    backgroundColor: "#ccc",
  },
  publishText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#fff",
    textAlign: "center",
  },
});
