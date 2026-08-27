import React from "react";
import { View, TextInput, TouchableOpacity } from "react-native";
import Ionicons from "react-native-vector-icons/Ionicons";
import { ICON_MUTED, PLACEHOLDER } from "../../lib/theme";

/**
 * SearchBar — unified search input (icon + field + clear button).
 *
 * Replaces the 3 hand-rolled copies in ChatScreen, BulletinManagementTab
 * and StorageManagementTab (which also had slightly different styling).
 *
 * Props:
 *   value, onChange, placeholder
 */
export default function SearchBar({ value, onChange, placeholder }) {
  return (
    <View className="flex-row items-center bg-surface-card rounded-xl px-3 border border-secondary-light">
      <Ionicons name="search-outline" size={16} color={ICON_MUTED} />
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={PLACEHOLDER}
        className="flex-1 ml-2 py-2 text-sm text-text-primary"
      />
      {value.length > 0 && (
        <TouchableOpacity onPress={() => onChange("")} activeOpacity={0.6}>
          <Ionicons name="close-circle" size={18} color={ICON_MUTED} />
        </TouchableOpacity>
      )}
    </View>
  );
}
