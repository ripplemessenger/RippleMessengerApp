import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  TextInput,
  Keyboard,
} from "react-native";
import { useTranslation } from "react-i18next";

import { getWallet } from "../lib/RippleUtil";
import Logger from "../lib/Logger";

/**
 * TempLoginModal - Temporary login via seed paste.
 * User enters a seed, derives the address, and logs in without saving to DB.
 * Matches Client/src/pages/TempLoginModal.jsx + OpenPage temp login behaviour.
 */
export default function TempLoginModal({ visible, onClose, onLogin }) {
  const { t } = useTranslation();
  const [seed, setSeed] = useState("");
  const [address, setAddress] = useState("");
  const [error, setError] = useState(null);

  useEffect(() => {
    if (visible) {
      setSeed("");
      setAddress("");
      setError(null);
    }
  }, [visible]);

  const handleSeedChange = (value) => {
    const trimmed = value.trim();
    setSeed(trimmed);
    setAddress("");
    setError(null);

    if (trimmed === "") return;

    try {
      const wallet = getWallet(trimmed);
      setAddress(wallet.classicAddress);
    } catch (e) {
      Logger.debug("[TempLogin] invalid seed:", e);
      setError(t("auth.invalid_seed"));
    }
  };

  const handleTempLogin = () => {
    Keyboard.dismiss();
    if (!seed.trim()) {
      setError(t("auth.seed_required"));
      return;
    }

    // Address already derived by handleSeedChange — only reach here with valid seed
    onLogin({ seed, address });
  };

  if (!visible) return null;

  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <View className="flex-1 bg-black/60 justify-center items-center px-6">
        <View className="w-full max-w-sm bg-surface rounded-2xl p-6">
          {/* Header */}
          <View className="flex-row justify-between items-center mb-4">
            <Text className="text-lg font-semibold text-text-primary">
              {t("auth.temporary_login")}
            </Text>
            <TouchableOpacity onPress={onClose}>
              <Text className="text-base text-text-secondary">
                {t("common.close")}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Description */}
          <Text className="text-sm text-text-secondary mb-4">
            {t("auth.temp_login_desc")}
          </Text>

          {/* Seed Input */}
          <View className="mb-4">
            <Text className="text-sm font-medium text-text-primary mb-1">
              {t("auth.seed_label")}
            </Text>
            <View className="border border-secondary-light rounded-xl bg-surface-card px-3 py-2">
              <TextInput
                value={seed}
                onChangeText={handleSeedChange}
                placeholder="s.................................."
                autoCapitalize="none"
                keyboardType="visible-password"
                secureTextEntry
                className="text-text-primary font-mono"
              />
            </View>
          </View>

          {/* Derived Address (read-only) */}
          {address !== "" && (
            <View className="mb-4">
              <Text className="text-sm font-medium text-text-primary mb-1">
                {t("auth.address_label")}
              </Text>
              <View className="border border-secondary-light rounded-xl bg-surface-card px-3 py-2">
                <Text className="text-xs text-text-secondary font-mono break-all">
                  {address}
                </Text>
              </View>
            </View>
          )}

          {/* Error Display */}
          {error !== null && (
            <View className="p-3 rounded-xl border border-status-error/30 bg-status-error/5 mb-4">
              <Text className="text-sm text-status-error text-center">
                {error}
              </Text>
            </View>
          )}

          {/* Login Button */}
          <TouchableOpacity
            onPress={handleTempLogin}
            disabled={seed.trim() === "" || error !== null}
            className="bg-primary py-3 rounded-xl items-center mb-3"
          >
            <Text className="text-base font-semibold text-text-primary">
              {t("auth.login_temporarily")}
            </Text>
          </TouchableOpacity>

          {/* Close Button */}
          <TouchableOpacity
            onPress={onClose}
            className="bg-surface-card border border-secondary py-3 rounded-xl items-center"
          >
            <Text className="text-base font-medium text-text-secondary">
              {t("common.cancel")}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
