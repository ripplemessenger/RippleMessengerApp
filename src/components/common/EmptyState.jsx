import React from "react";
import { View, Text } from "react-native";
import Ionicons from "react-native-vector-icons/Ionicons";
import { EMPTY_ICON } from "../../lib/theme";

/**
 * EmptyState — unified empty-list placeholder.
 *
 * Before this component, every screen hand-rolled its own empty state with
 * slightly different icon sizes, paddings and title margins.
 *
 * Props:
 *   icon  - Ionicons name (e.g. "star-outline")
 *   emoji - alternative to icon (e.g. "📝")
 *   title - main line
 *   hint  - secondary line
 */
export default function EmptyState({ icon, emoji, title, hint }) {
     return (
          <View className="flex-1 items-center justify-center py-20 px-8">
               {emoji ? (
                    <Text className="text-5xl mb-4">{emoji}</Text>
               ) : (
                    <Ionicons name={icon} size={48} color={EMPTY_ICON} />
               )}
               <Text className="text-xl font-bold text-text-primary mt-3 mb-1">
                    {title}
               </Text>
               {hint ? (
                    <Text className="text-sm text-text-secondary text-center px-8">
                         {hint}
                    </Text>
               ) : null}
          </View>
     );
}
