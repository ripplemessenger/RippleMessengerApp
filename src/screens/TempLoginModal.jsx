import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  Keyboard,
} from "react-native";
import { useTranslation } from "react-i18next";

import { getWallet } from "../lib/RippleUtil";
import Logger from "../lib/Logger";
import ModalShell from "../components/common/ModalShell";
import ConfirmButtonRow from "../components/common/ConfirmButtonRow";

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
    <ModalShell
      visible={visible}
      onClose={onClose}
      title={t("auth.temporary_login")}
    >
      {/* Description */}
      <Text className="text-sm text-text-secondary">
        {t("auth.temp_login_desc")}
      </Text>

      {/* Seed Input */}
      <View>
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
        <View>
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
        <View className="p-3 rounded-xl border border-status-error/30 bg-status-error/5">
          <Text className="text-sm text-status-error text-center">{error}</Text>
        </View>
      )}

      {/* Buttons */}
      <ConfirmButtonRow
        onCancel={onClose}
        onConfirm={handleTempLogin}
        confirmText={t("auth.login_temporarily")}
        confirmDisabled={seed.trim() === "" || error !== null}
      />
    </ModalShell>
  );
}
