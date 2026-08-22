import React from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Linking,
} from "react-native";
import Ionicons from "react-native-vector-icons/Ionicons";

import { MasterAddress } from "../lib/MessengerConst";

/**
 * AboutScreen — content copied from the Client's AboutPage
 * (Client/src/pages/AboutPage.jsx + i18n about.content).
 *
 * Rules:
 * 1. No Human Verification
 * 2. No Content Moderation
 * 3. No Recommendation
 * 4. No Recall
 * 5. Data on My Devices
 * 6. Encrypted Chat
 * 7. Publish(Comment) bulletin freely
 *
 * Donate: MasterAddress
 */

const RULES = [
  "No Human Verification",
  "No Content Moderation",
  "No Recommendation",
  "No Recall",
  "Data on My Devices",
  "Encrypted Chat",
  "Publish(Comment) bulletin freely",
];

export default function AboutScreen({ navigation }) {
  return (
    <ScrollView className="flex-1 bg-surface">
      <View className="px-6 py-8 gap-6">
        {/* Header with back button */}
        <View className="flex-row items-center gap-3 pt-6">
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            activeOpacity={0.7}
            style={{ padding: 4 }}
          >
            <Ionicons name="arrow-back" size={24} color="#e6b420" />
          </TouchableOpacity>
          <Text className="text-2xl font-bold text-text-primary">About</Text>
        </View>

        {/* Divider */}
        <View className="h-px bg-secondary" />

        {/* Rules */}
        <View className="bg-surface-card rounded-2xl p-5 border border-secondary-light gap-3">
          <Text className="text-xl font-bold text-text-primary mb-1">
            Rules
          </Text>
          {RULES.map((rule, i) => (
            <View key={rule} className="flex-row items-start gap-3">
              <Text className="text-base text-primary font-semibold w-6">
                {i + 1}.
              </Text>
              <Text className="text-base text-text-primary flex-1">{rule}</Text>
            </View>
          ))}
        </View>

        {/* Donate */}
        <View className="bg-surface-card rounded-2xl p-5 border border-secondary-light gap-3">
          <Text className="text-xl font-bold text-text-primary">Donate</Text>
          <Text className="text-sm font-mono text-text-secondary break-all">
            {MasterAddress}
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}
