import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import Ionicons from "react-native-vector-icons/Ionicons";
import { ACCENT, ICON_MUTED } from "../../lib/theme";

/**
 * FilterChips — shared row of equal-width filter chips.
 *
 * Before this component, BulletinManagementTab and StorageManagementTab each
 * hand-rolled the same chip row with slightly different markup.
 *
 * Props:
 *   options   - [{ key, label, icon? }]  (label is pre-translated; icon optional)
 *   activeKey - currently active option key
 *   onSelect  - (key) => void
 *   trailing  - optional ReactNode rendered after the chips (e.g. a select toggle)
 */
export default function FilterChips({
  options,
  activeKey,
  onSelect,
  trailing,
}) {
  return (
    <View className="flex-row bg-surface-card rounded-xl p-1 border border-secondary-light">
      {options.map((opt) => {
        const isActive = activeKey === opt.key;
        return (
          <TouchableOpacity
            key={opt.key}
            onPress={() => onSelect(opt.key)}
            className={`flex-1 py-2 rounded-lg items-center ${
              isActive ? "bg-primary/15" : ""
            }`}
          >
            {opt.icon ? (
              <Ionicons
                name={isActive ? opt.icon : `${opt.icon}-outline`}
                size={14}
                color={isActive ? ACCENT : ICON_MUTED}
              />
            ) : null}
            <Text
              className={[
                "text-[10px]",
                "font-medium",
                isActive ? "text-primary" : "text-text-secondary",
                opt.icon ? "mt-0.5" : "",
              ].join(" ")}
            >
              {opt.label}
            </Text>
          </TouchableOpacity>
        );
      })}
      {trailing ? (
        <View className="py-2 px-3 rounded-lg items-center">{trailing}</View>
      ) : null}
    </View>
  );
}
