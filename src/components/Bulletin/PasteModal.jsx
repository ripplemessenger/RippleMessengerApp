import React, { useState, useCallback } from "react";
import { Modal, View, Text, TextInput, TouchableOpacity } from "react-native";
import Ionicons from "react-native-vector-icons/Ionicons";
import { useDispatch } from "react-redux";

import { setPasteFlag } from "../../store/slices/MessengerSlice";
import { UploadBulletin } from "../../store/sagas/messenger.actions";
import { checkBulletinSchema } from "../../lib/MessageSchemaVerifier";
import { VerifyJsonSignature } from "../../lib/MessengerUtil";

const ERROR_TEXT = {
  json: "Not valid JSON",
  schema: "Bulletin schema invalid",
  signature: "Signature invalid",
};

/**
 * PasteModal — paste a raw bulletin JSON, validate it, and save to cache.
 *
 * React Native port of the Client's BulletinPaste. The backend already exists
 * (UploadBulletin saga + checkBulletinSchema + VerifyJsonSignature); this is
 * the missing UI. Live-validates as the user types and enables the Save
 * button only when the JSON parses, matches the bulletin schema, and passes
 * signature verification.
 */
export default function PasteModal({ visible, onClose }) {
  const dispatch = useDispatch();
  const [tmpBulletin, setTmpBulletin] = useState("");
  const [status, setStatus] = useState({
    valid: false,
    error: null,
    json: null,
  });

  const validate = useCallback((text) => {
    const trimmed = text.trim();
    if (trimmed === "") return { valid: false, error: null, json: null };
    try {
      const json = JSON.parse(trimmed);
      if (!checkBulletinSchema(json))
        return { valid: false, error: "schema", json: null };
      if (!VerifyJsonSignature(json))
        return { valid: false, error: "signature", json: null };
      return { valid: true, error: null, json };
    } catch {
      return { valid: false, error: "json", json: null };
    }
  }, []);

  const handleChange = useCallback(
    (text) => {
      setTmpBulletin(text);
      setStatus(validate(text));
    },
    [validate],
  );

  const handleClose = useCallback(() => {
    setTmpBulletin("");
    setStatus({ valid: false, error: null, json: null });
    onClose();
  }, [onClose]);

  const handleSave = useCallback(() => {
    if (!status.valid || !status.json) return;
    dispatch(UploadBulletin({ json: status.json }));
    handleClose();
  }, [status, dispatch, handleClose]);

  const errorText = status.error ? ERROR_TEXT[status.error] : null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
    >
      <View className="flex-1 bg-black/45 justify-end">
        <View className="w-[40px] h-[5px] bg-text-secondary/30 rounded-full self-center mt-3 mb-2" />
        <View className="bg-surface-card rounded-t-3xl px-5 pt-4 pb-6 border-t border-secondary-light">
          {/* Header */}
          <View className="flex-row items-center justify-between pb-3 border-b border-secondary-light/20">
            <Text className="text-lg font-bold text-text-primary">
              Paste Bulletin JSON
            </Text>
            <TouchableOpacity onPress={handleClose} hitSlop={10}>
              <Ionicons name="close" size={24} color="#999" />
            </TouchableOpacity>
          </View>

          {/* Input */}
          <TextInput
            value={tmpBulletin}
            onChangeText={handleChange}
            placeholder="Paste bulletin JSON here..."
            placeholderTextColor="#a89f85"
            multiline
            numberOfLines={8}
            className="mt-3 bg-surface rounded-lg px-3 py-2 border border-secondary-light/30 text-sm text-text-primary"
            style={{ minHeight: 160, textAlignVertical: "top" }}
          />

          {/* Status */}
          {errorText ? (
            <Text className="mt-2 text-sm text-red-500">{errorText}</Text>
          ) : status.valid ? (
            <Text className="mt-2 text-sm text-green-600">
              ✓ Valid bulletin — ready to save
            </Text>
          ) : null}

          {/* Save */}
          <TouchableOpacity
            onPress={handleSave}
            disabled={!status.valid}
            activeOpacity={0.8}
            className={`mt-4 py-3 rounded-xl items-center ${
              status.valid ? "bg-primary" : "bg-surface-alt"
            }`}
          >
            <Text
              className={`text-base font-medium ${
                status.valid ? "text-white" : "text-text-secondary/50"
              }`}
            >
              Save Bulletin
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
