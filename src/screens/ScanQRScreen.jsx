import React, { useState, useCallback, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Keyboard,
} from "react-native";
import {
  Camera,
  useCameraDevice,
  useCodeScanner,
} from "react-native-vision-camera";
import { useTranslation } from "react-i18next";

import { getWallet } from "../lib/RippleUtil";
import {
  genSalt,
  encryptWithPassword,
  decryptWithPassword,
} from "../lib/AppUtil";
import { dbAPI } from "../db";
import Logger from "../lib/Logger";

export default function ScanQRScreen({ navigation }) {
  const { t } = useTranslation();
  const [scanned, setScanned] = useState(false);
  const [qrData, setQrData] = useState(null);
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [permission, setPermission] = useState(null);

  const device = useCameraDevice("back");

  // Built-in code scanner (same as ContactScreen's QrScannerModal)
  const codeScanner = useCodeScanner({
    codeTypes: ["qr"],
    onCodeScanned: (codes) => {
      if (codes.length > 0 && !scanned) {
        const value = codes[0].value;
        if (value) {
          try {
            const parsed = JSON.parse(value);
            if (parsed.v === 1 && parsed.addr && parsed.salt && parsed.ct) {
              setQrData(parsed);
              setScanned(true);
            }
          } catch (e) {
            // Not a valid QR payload, keep scanning
          }
        }
      }
    },
  });

  // Request camera permission (same as ContactScreen)
  const requestPermission = useCallback(() => {
    setScanned(false);
    setPermission(null);
    Camera.requestCameraPermission()
      .then((p) => setPermission(p === "granted"))
      .catch(() => setPermission(false));
  }, []);

  useEffect(() => {
    requestPermission();
  }, [requestPermission]);

  const showCamera = device && permission;

  // Handle successful scan → show password input
  const handleImport = async () => {
    Keyboard.dismiss();
    setError(null);

    if (!qrData) return;
    if (password.trim() === "") {
      setError(t("auth.password_required"));
      return;
    }

    setLoading(true);
    try {
      // Decrypt seed using the QR's salt and cipher data (2000 iterations)
      const seed = decryptWithPassword(password, qrData.salt, qrData.ct);

      // Validate: derived address must match QR's address
      const wallet = getWallet(seed);
      if (wallet.classicAddress !== qrData.addr) {
        setError(t("auth.qr_address_mismatch"));
        setLoading(false);
        return;
      }

      // Re-encrypt with new salt + user's password (for local storage)
      const newSalt = genSalt();
      const cipherData = encryptWithPassword(seed, password, newSalt);

      // Save to database
      const existing = await dbAPI.getAccountByAddress(qrData.addr);
      if (existing) {
        await dbAPI.updateAccount(qrData.addr, newSalt, cipherData, Date.now());
      } else {
        await dbAPI.addAccount(qrData.addr, newSalt, cipherData, Date.now());
      }

      Logger.info("[ScanQR] Account imported:", qrData.addr);
      navigation.goBack();
    } catch (e) {
      Logger.error("[ScanQR] import failed:", e);
      setError(
        e.message ===
          "Decrypt failed: empty result (wrong password or corrupted data)"
          ? t("auth.qr_wrong_password")
          : typeof e === "string"
            ? e
            : String(e),
      );
    } finally {
      setLoading(false);
    }
  };

  // Camera view (before scan)
  if (!scanned) {
    return (
      <View className="flex-1 bg-black">
        {showCamera ? (
          <>
            <Camera
              style={{ flex: 1 }}
              device={device}
              isActive={true}
              codeScanner={codeScanner}
            />
            {/* Overlay */}
            <View className="absolute inset-0 justify-between">
              {/* Top bar */}
              <View className="flex-row items-center p-4">
                <TouchableOpacity
                  onPress={() => navigation.goBack()}
                  className="bg-black/50 rounded-full p-3"
                >
                  <Text className="text-white text-xl">✕</Text>
                </TouchableOpacity>
                <View className="flex-1" />
              </View>

              {/* Scan frame */}
              <View className="items-center">
                <View
                  className="w-64 h-64 border-2 border-white/70 rounded-2xl"
                  style={{
                    borderWidth: 2,
                    borderColor: "rgba(255,255,255,0.7)",
                  }}
                />
                <Text className="text-white/80 mt-4 text-sm">
                  {t("auth.qr_scan_hint")}
                </Text>
              </View>

              {/* Bottom spacer */}
              <View className="h-20" />
            </View>
          </>
        ) : (
          <View className="flex-1 items-center justify-center px-8">
            <Text className="text-5xl mb-4">📷</Text>
            <Text className="text-white text-center mb-4">
              {device
                ? t("auth.camera_permission_denied")
                : t("setting.no_camera")}
            </Text>
            {device && (
              <TouchableOpacity
                onPress={requestPermission}
                className="bg-white/20 rounded-xl px-6 py-3"
              >
                <Text className="text-white text-base">
                  {t("setting.retry")}
                </Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPress={() => navigation.goBack()}
              className="mt-4"
            >
              <Text className="text-white/60 text-sm">
                {t("auth.back_to_login")}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  }

  // Password input view (after scan)
  return (
    <View className="flex-1 bg-surface px-6 py-10 items-center">
      {/* Success indicator */}
      <View className="w-16 h-16 rounded-full bg-status-success/10 items-center justify-center mb-4">
        <Text className="text-3xl">✓</Text>
      </View>
      <Text className="text-xl font-bold text-text-primary mb-2">
        {t("auth.qr_scanned")}
      </Text>
      <Text className="text-sm text-text-secondary mb-6 text-center">
        {qrData.addr}
      </Text>

      {/* Password input */}
      <View className="w-full max-w-sm mb-6">
        <Text className="text-sm font-medium text-text-primary mb-1">
          {t("auth.password_label")}
        </Text>
        <View className="border border-secondary-light rounded-xl bg-surface-card px-3 py-2">
          <TextInput
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            placeholder="........"
            autoCapitalize="none"
            className="text-text-primary"
            autoFocus
          />
        </View>
      </View>

      {/* Error */}
      {error !== null && (
        <View className="p-3 rounded-xl border border-status-error/30 bg-status-error/5 mb-6 w-full max-w-sm">
          <Text className="text-sm text-status-error text-center">{error}</Text>
        </View>
      )}

      {/* Import button */}
      <TouchableOpacity
        onPress={handleImport}
        disabled={loading || password.length === 0}
        className="bg-primary py-3 rounded-xl items-center w-full max-w-sm mb-4"
      >
        {loading ? (
          <ActivityIndicator color="#1a1a2e" />
        ) : (
          <Text className="text-base font-semibold text-text-primary">
            {t("auth.import_title")}
          </Text>
        )}
      </TouchableOpacity>

      {/* Rescan */}
      <TouchableOpacity
        onPress={() => {
          setScanned(false);
          setQrData(null);
          setPassword("");
          setError(null);
        }}
        disabled={loading}
        className="bg-surface-card border border-secondary py-3 rounded-xl items-center w-full max-w-sm"
      >
        <Text className="text-base font-medium text-text-secondary">
          {t("auth.qr_rescan")}
        </Text>
      </TouchableOpacity>
    </View>
  );
}
