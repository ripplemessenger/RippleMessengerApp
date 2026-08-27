import React from "react";
import { View, Text, ActivityIndicator } from "react-native";
import { useTranslation } from "react-i18next";
import { ACCENT } from "../../lib/theme";

/**
 * ListFooter — "loading more" footer for paginated FlatLists.
 * Renders null when `loading` is false.
 */
export default function ListFooter({ loading }) {
  const { t } = useTranslation();
  if (!loading) return null;
  return (
    <View className="py-4 items-center">
      <ActivityIndicator size="small" color={ACCENT} />
      <Text className="text-xs text-text-secondary/70 mt-1">
        {t("common.loading_more")}
      </Text>
    </View>
  );
}
