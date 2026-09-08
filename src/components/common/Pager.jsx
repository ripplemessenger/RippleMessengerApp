import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { useTranslation } from "react-i18next";
import Ionicons from "react-native-vector-icons/Ionicons";
import { ICON_MUTED } from "../../lib/theme";

/**
 * Pager — shared Prev / Next pagination bar with a center page indicator.
 *
 * Before this component, BulletinManagementTab and StorageManagementTab each
 * hand-rolled an identical Prev/Next bar.
 *
 * Props:
 *   page        - current page (1-based); Prev is disabled when page <= 1
 *   onPrev      - () => void
 *   onNext      - () => void
 *   centerLabel - center indicator text (pre-translated, e.g. "Page 2")
 *   loading     - optional; disables both buttons while true
 */
export default function Pager({ page, onPrev, onNext, centerLabel, loading }) {
  const { t } = useTranslation();
  return (
    <View className="flex-row items-center justify-between px-2">
      <TouchableOpacity
        onPress={onPrev}
        disabled={page <= 1 || loading}
        className={`py-2 px-4 rounded-lg ${
          page > 1
            ? "bg-surface-card border border-secondary-light"
            : "opacity-30"
        }`}
      >
        <View className="flex-row items-center gap-1">
          <Ionicons name="chevron-back" size={14} color={ICON_MUTED} />
          <Text className="text-xs text-text-secondary">
            {t("common.prev")}
          </Text>
        </View>
      </TouchableOpacity>
      <Text className="text-xs text-text-secondary/60">{centerLabel}</Text>
      <TouchableOpacity
        onPress={onNext}
        disabled={loading}
        className="py-2 px-4 rounded-lg bg-surface-card border border-secondary-light"
      >
        <View className="flex-row items-center gap-1">
          <Text className="text-xs text-text-secondary">
            {t("common.next")}
          </Text>
          <Ionicons name="chevron-forward" size={14} color={ICON_MUTED} />
        </View>
      </TouchableOpacity>
    </View>
  );
}
