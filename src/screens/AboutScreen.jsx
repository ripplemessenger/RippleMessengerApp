import React, { useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Clipboard,
} from "react-native";
import { useDispatch } from "react-redux";

import { MasterAddress } from "../lib/MessengerConst";
import { setFlashNoticeMessage } from "../store/slices/CommonSlice";

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

export default function AboutScreen() {
  const { t } = useTranslation();
  const dispatch = useDispatch();

  const handleCopyAddress = useCallback(() => {
    Clipboard.setString(MasterAddress);
    dispatch(
      setFlashNoticeMessage({
        message: t("common.copied_to_clipboard"),
      }),
    );
  }, [t, dispatch]);
  return (
    <ScrollView className="flex-1 bg-surface">
      <View className="px-6 py-8 gap-6">
        {/* Rules */}
        <View className="bg-surface-card rounded-2xl p-5 border border-secondary-light gap-3">
          <Text className="text-xl font-bold text-text-primary">
            {t("about.rules")}
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
          <Text className="text-xl font-bold text-text-primary">
            {t("about.donate")}
          </Text>
          <TouchableOpacity onPress={handleCopyAddress} activeOpacity={0.6}>
            <Text className="text-sm font-mono text-text-secondary break-all">
              {MasterAddress}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );
}
