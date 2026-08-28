import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { useTranslation } from "react-i18next";

/**
 * ConfirmButtonRow — unified cancel/confirm button pair for modals.
 *
 * Replaces 6+ hand-rolled copies of the same two-button row.
 *
 * Props:
 *   onCancel, onConfirm
 *   cancelText  - defaults to t("common.cancel")
 *   confirmText - required
 *   confirmDisabled - disables the confirm button
 */
export default function ConfirmButtonRow({
  onCancel,
  onConfirm,
  cancelText,
  confirmText,
  confirmDisabled = false,
  showCancel = true,
}) {
  const { t } = useTranslation();
  if (!showCancel) {
    return (
      <TouchableOpacity
        onPress={onConfirm}
        disabled={confirmDisabled}
        activeOpacity={0.7}
        className={`mt-2 py-3 rounded-xl items-center ${
          confirmDisabled ? "bg-primary/20" : "bg-primary"
        }`}
      >
        <Text
          className={`text-base font-semibold ${
            confirmDisabled ? "text-text-secondary/50" : "text-text-primary"
          }`}
        >
          {confirmText}
        </Text>
      </TouchableOpacity>
    );
  }
  return (
    <View className="flex-row gap-3 mt-2">
      <TouchableOpacity
        onPress={onCancel}
        activeOpacity={0.7}
        className="flex-1 py-3 rounded-xl border border-secondary-light items-center"
      >
        <Text className="text-base font-medium text-text-secondary">
          {cancelText || t("common.cancel")}
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={onConfirm}
        disabled={confirmDisabled}
        activeOpacity={0.7}
        className={`flex-1 py-3 rounded-xl items-center ${
          confirmDisabled ? "bg-primary/20" : "bg-primary"
        }`}
      >
        <Text
          className={`text-base font-semibold ${
            confirmDisabled ? "text-text-secondary/50" : "text-text-primary"
          }`}
        >
          {confirmText}
        </Text>
      </TouchableOpacity>
    </View>
  );
}
