import React, { useState, useCallback, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  Switch,
  Keyboard,
  Clipboard,
} from "react-native";
import { useSelector, useDispatch } from "react-redux";
import { useTranslation } from "react-i18next";
import Ionicons from "react-native-vector-icons/Ionicons";

import RNFS from "react-native-fs";
import AvatarImage from "../components/AvatarImage";
import BottomSheet from "../components/common/BottomSheet";
import ModalShell from "../components/common/ModalShell";
import ConfirmButtonRow from "../components/common/ConfirmButtonRow";
import useDarkMode from "../hooks/useDarkMode";
import { dbAPI } from "../db";
import { AvatarRequest } from "../store/sagas/messenger.bulletin";
import * as fileService from "../services/fileService";
import ImageCropPicker from "react-native-image-crop-picker";
import { selectUserTabMe, selectConnectedServerCount } from "../selectors";
import { shortenAddress } from "../lib/format";
import { logoutStart, setNickname } from "../store/slices/UserSlice";
import { setFlashNoticeMessage } from "../store/slices/CommonSlice";
import {
  SaveSelfAvatar,
  ContactAdd,
  AccountDel,
} from "../store/sagas/messenger.actions";
import { FileHash, base64ToUint8Array } from "../lib/MessengerUtil";
import QRCode from "qrcode";
import { DefaultServer } from "../lib/MessengerConst";
import {
  getSettingBool,
  getSettingString,
  setSetting,
} from "../lib/SettingsUtil";
import { previewSound } from "../lib/SoundUtil";
import {
  ACCENT,
  ICON_MUTED,
  PLACEHOLDER,
  SWITCH_TRACK_OFF,
} from "../lib/theme";
import i18n from "../i18n";

const APP_VERSION = "0.1.0";

const LANGUAGE_OPTIONS = [
  { code: "en", label: "English" },
  { code: "zh", label: "中文" },
  { code: "fr", label: "Français" },
  { code: "ru", label: "Русский" },
  { code: "ja", label: "日本語" },
  { code: "ko", label: "한국어" },
  { code: "es", label: "Español" },
  { code: "pt", label: "Português" },
  { code: "de", label: "Deutsch" },
];

const SOUND_OPTIONS = [
  { value: "chime", label: "Chime", icon: "🔔" },
  { value: "pop", label: "Pop", icon: "🫧" },
  { value: "ping", label: "Ping", icon: "📞" },
  { value: "bloop", label: "Bloop", icon: "💬" },
  { value: "ding", label: "Ding", icon: "🔔" },
  { value: "blip", label: "Blip", icon: "👾" },
  { value: "none", label: "None", icon: "🔇" },
];

// ---------------------------------------------------------------------------
// Reusable list primitives
// ---------------------------------------------------------------------------
function SectionHeader({ icon, label, iconColor = ACCENT }) {
  return (
    <View className="flex-row items-center gap-2 px-1 pt-5 pb-2">
      <Ionicons name={icon} size={16} color={iconColor} />
      <Text className="text-xs font-semibold uppercase tracking-wide text-text-secondary/70">
        {label}
      </Text>
    </View>
  );
}

// A tappable row that navigates somewhere, with an optional value + chevron.
function NavRow({ icon, iconColor = ACCENT, label, value, onPress }) {
  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={onPress}
      className="flex-row items-center gap-3 px-4 py-3.5 active:bg-surface-alt/40"
    >
      <View className="w-8 h-8 rounded-lg bg-primary/10 items-center justify-center">
        <Ionicons name={icon} size={18} color={iconColor} />
      </View>
      <Text className="flex-1 text-base text-text-primary">{label}</Text>
      {value ? (
        <Text className="text-sm text-text-secondary">{value}</Text>
      ) : null}
      <Ionicons name="chevron-forward" size={18} color="#c4bda8" />
    </TouchableOpacity>
  );
}

// A row with an inline switch.
function SwitchRow({ icon, iconColor = ACCENT, label, value, onValueChange }) {
  return (
    <View className="flex-row items-center gap-3 px-4 py-3.5">
      <View className="w-8 h-8 rounded-lg bg-primary/10 items-center justify-center">
        <Ionicons name={icon} size={18} color={iconColor} />
      </View>
      <Text className="flex-1 text-base text-text-primary">{label}</Text>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: SWITCH_TRACK_OFF, true: ACCENT }}
        thumbColor={value ? "#fff" : "#f4f3f4"}
      />
    </View>
  );
}

function Divider() {
  return <View className="h-px bg-secondary-light/40 mx-4" />;
}

// QR code rendered as run-length-encoded rows (pure JS via `qrcode` create,
// no canvas/native dependency — safe in React Native).
function QrCodeView({ value, size = 300, dark = false }) {
  const rows = React.useMemo(() => {
    const { modules } = QRCode.create(value, { errorCorrectionLevel: "M" });
    const n = modules.size;
    const cell = size / n;
    const out = [];
    for (let r = 0; r < n; r++) {
      const segs = [];
      let start = 0;
      while (start < n) {
        let end = start + 1;
        while (
          end < n &&
          modules.data[r * n + end] === modules.data[r * n + start]
        ) {
          end++;
        }
        if (modules.data[r * n + start]) {
          segs.push({ width: (end - start) * cell, dark: true });
        } else {
          segs.push({ width: (end - start) * cell, dark: false });
        }
        start = end;
      }
      out.push(segs);
    }
    return out;
  }, [value, size]);
  const cell = size / rows.length;
  const bg = dark ? "#2A2A34" : "#FFFFFF";
  const fg = dark ? "#F0EAD6" : "#1A1A2E";
  return (
    <View
      style={{
        width: size + 16,
        height: size + 16,
        backgroundColor: bg,
        padding: 8,
      }}
    >
      {rows.map((segs, r) => (
        <View key={r} style={{ flexDirection: "row", height: cell }}>
          {segs.map((s, i) => (
            <View
              key={i}
              style={{
                width: s.width,
                height: cell,
                backgroundColor: s.dark ? fg : "transparent",
              }}
            />
          ))}
        </View>
      ))}
    </View>
  );
}

// ---------------------------------------------------------------------------
// SettingScreen — mobile settings list (single scroll, sections, sub-screens)
// ---------------------------------------------------------------------------
export default function SettingScreen({ navigation }) {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const { Address, Nickname, Seed } = useSelector(selectUserTabMe);
  const connectedCount = useSelector(selectConnectedServerCount);
  const ServerList = useSelector((state) => state.Messenger.ServerList);
  const { isDark, toggle } = useDarkMode();

  // --- Nickname edit ---
  const [showNicknameModal, setShowNicknameModal] = useState(false);
  const [nicknameInput, setNicknameInput] = useState("");
  const [showQrModal, setShowQrModal] = useState(false);
  // Keyboard height (measured via Keyboard events) so the dialog is pushed
  // above the keyboard. adjustResize does not reliably reach RN Modals on
  // Android, so we measure the keyboard ourselves.
  const [kbHeight, setKbHeight] = useState(0);
  useEffect(() => {
    const showSub = Keyboard.addListener("keyboardDidShow", (e) =>
      setKbHeight(e.endCoordinates.height),
    );
    const hideSub = Keyboard.addListener("keyboardDidHide", () =>
      setKbHeight(0),
    );
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);
  const handleNicknameSave = useCallback(() => {
    const value = nicknameInput.trim();
    if (value && Address) {
      dispatch(ContactAdd({ address: Address, nickname: value }));
      dispatch(setNickname(value));
    }
    setShowNicknameModal(false);
  }, [nicknameInput, Address, dispatch]);

  // --- Avatar change ---
  const [avatarLoading, setAvatarLoading] = useState(false);
  const handleAvatarPress = useCallback(async () => {
    if (avatarLoading) return;
    setAvatarLoading(true);
    try {
      // Open the picker with a native crop UI (square, like the Client's AvatarCropper).
      const image = await ImageCropPicker.openPicker({
        mediaType: "photo",
        cropping: true,
        cropperCircleOverlay: true,
        width: 512,
        height: 512,
        hideBottomControls: true,
        showCropUI: true,
      });
      if (!image || !image.path) {
        setAvatarLoading(false);
        return;
      }
      const base64Data = await RNFS.readFile(image.path, "base64");
      const content = base64ToUint8Array(base64Data);
      const hash = FileHash(content);
      const size = image.size || content.length;
      await fileService.writeFile(fileService.getAvatarPath(Address), content);
      dispatch(SaveSelfAvatar({ hash, size, timestamp: Date.now() }));
    } catch (e) {
      if (e?.code !== "E_CANCELED") {
        Alert.alert(
          t("setting.avatar"),
          e.message || t("setting.failed_to_set_avatar"),
        );
      }
    } finally {
      setAvatarLoading(false);
    }
  }, [Address, dispatch, avatarLoading]);

  // --- Copy Seed ---
  const handleCopySeed = useCallback(() => {
    if (!Seed) {
      dispatch(
        setFlashNoticeMessage({
          message: t("setting.no_seed_available"),
          duration: 2000,
        }),
      );
      return;
    }
    Clipboard.setString(Seed);
    dispatch(
      setFlashNoticeMessage({
        message: t("common.copied_to_clipboard"),
        duration: 2000,
      }),
    );
  }, [Seed, dispatch]);

  // --- Copy Address ---
  const handleCopyAddress = useCallback(() => {
    if (!Address) {
      dispatch(
        setFlashNoticeMessage({
          message: t("setting.no_address_available"),
          duration: 2000,
        }),
      );
      return;
    }
    Clipboard.setString(Address);
    dispatch(
      setFlashNoticeMessage({
        message: t("common.copied_to_clipboard"),
        duration: 2000,
      }),
    );
  }, [Address, dispatch]);

  // --- Delete Account ---
  const handleDelAccount = useCallback(() => {
    Alert.alert(
      t("auth.remove_account"),
      t("auth.remove_account_confirm", { address: shortenAddress(Address) }),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("common.delete"),
          style: "destructive",
          onPress: () => {
            dispatch(AccountDel({ address: Address }));
            dispatch(
              setFlashNoticeMessage({
                message: t("setting.account_deleted"),
                duration: 2000,
              }),
            );
          },
        },
      ],
    );
  }, [Address, dispatch]);

  // --- Logout ---
  const handleLogout = useCallback(() => {
    Alert.alert(t("setting.logout"), t("setting.logout_confirm"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("setting.logout"),
        style: "destructive",
        onPress: () => dispatch(logoutStart()),
      },
    ]);
  }, [dispatch]);

  // --- Sound (persisted via SettingsUtil) ---
  const [messageSound, setMessageSound] = useState("chime");
  const [showSoundSheet, setShowSoundSheet] = useState(false);

  // --- Language (persisted via SettingsUtil) ---
  const [language, setLanguage] = useState("en");
  const [showLanguageSheet, setShowLanguageSheet] = useState(false);

  // --- Auto-download settings (persisted via SettingsUtil) ---
  const [autoDownloadFollow, setAutoDownloadFollow] = useState(true);
  const [autoDownloadPrivate, setAutoDownloadPrivate] = useState(true);
  const [autoDownloadGroup, setAutoDownloadGroup] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [sound, follow, priv, group, lang] = await Promise.all([
          getSettingString("messageSound", "chime"),
          getSettingBool("autoDownloadFollowFiles", true),
          getSettingBool("autoDownloadPrivateFiles", true),
          getSettingBool("autoDownloadGroupFiles", true),
          getSettingString("language", "en"),
        ]);
        setMessageSound(sound);
        setAutoDownloadFollow(follow);
        setAutoDownloadPrivate(priv);
        setAutoDownloadGroup(group);
        setLanguage(lang);
      } catch {
        // use defaults
      }
    })();
  }, []);

  const handleAutoDownloadFollowToggle = useCallback(async (value) => {
    setAutoDownloadFollow(value);
    try {
      await setSetting("autoDownloadFollowFiles", value);
    } catch {
      // fail silently
    }
  }, []);

  const handleAutoDownloadPrivateToggle = useCallback(async (value) => {
    setAutoDownloadPrivate(value);
    try {
      await setSetting("autoDownloadPrivateFiles", value);
    } catch {
      // fail silently
    }
  }, []);

  const handleAutoDownloadGroupToggle = useCallback(async (value) => {
    setAutoDownloadGroup(value);
    try {
      await setSetting("autoDownloadGroupFiles", value);
    } catch {
      // fail silently
    }
  }, []);

  const handleSoundChange = useCallback(async (value) => {
    setMessageSound(value);
    setShowSoundSheet(false);
    try {
      await setSetting("messageSound", value);
      if (value !== "none") previewSound(value);
    } catch {
      // fail silently
    }
  }, []);

  const soundLabel =
    SOUND_OPTIONS.find((o) => o.value === messageSound)?.label || "Chime";

  const languageLabel =
    LANGUAGE_OPTIONS.find((o) => o.code === language)?.label || "English";

  const handleLanguageChange = useCallback(async (code) => {
    setLanguage(code);
    setShowLanguageSheet(false);
    try {
      await i18n.changeLanguage(code);
      await setSetting("language", code);
    } catch {
      // fail silently — UI state already updated
    }
  }, []);

  return (
    <View className="flex-1 bg-surface">
      {/* Header */}
      <View className="px-5 pt-6 pb-2">
        <Text className="text-3xl font-bold text-text-primary text-center">
          {t("setting.title")}
        </Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} className="flex-1">
        {/* Account */}
        <View className="bg-surface-card rounded-2xl m-4 p-4 border border-secondary-light flex-row items-center gap-3">
          <TouchableOpacity onPress={handleAvatarPress} activeOpacity={0.7}>
            <View className="relative w-14 h-14">
              <AvatarImage address={Address} nickname={Nickname} size={56} />
              <View className="absolute bottom-0 right-0 w-6 h-6 rounded-full bg-primary items-center justify-center border-2 border-surface-card">
                <Ionicons name="camera" size={12} color="#fff" />
              </View>
            </View>
          </TouchableOpacity>
          <View className="flex-1 min-w-0">
            <TouchableOpacity
              className="flex-row items-center gap-1"
              onPress={() => {
                setNicknameInput(Nickname || "");
                setShowNicknameModal(true);
              }}
              hitSlop={8}
            >
              <Text className="text-lg font-semibold text-text-primary truncate">
                {Nickname || t("setting.no_nickname")}
              </Text>
              <Ionicons name="create-outline" size={16} color={ICON_MUTED} />
            </TouchableOpacity>
            {Address ? (
              <TouchableOpacity
                onPress={handleCopyAddress}
                activeOpacity={0.7}
                hitSlop={8}
              >
                <Text className="text-xs font-mono text-text-secondary/70 truncate">
                  {Address}
                </Text>
              </TouchableOpacity>
            ) : null}
          </View>
          <TouchableOpacity
            onPress={() => setShowQrModal(true)}
            activeOpacity={0.7}
            hitSlop={8}
            className="w-10 h-10 rounded-lg bg-primary/10 items-center justify-center"
          >
            <Ionicons name="qr-code-outline" size={22} color={ACCENT} />
          </TouchableOpacity>
        </View>

        {/* Preferences */}
        <SectionHeader
          icon="color-palette-outline"
          label={t("setting.preferences")}
        />
        <View className="bg-surface-card rounded-2xl mx-4 border border-secondary-light overflow-hidden">
          <SwitchRow
            icon={isDark ? "moon" : "sunny"}
            label={t("setting.dark_mode")}
            value={isDark}
            onValueChange={toggle}
          />
          <Divider />
          <NavRow
            icon="volume-high-outline"
            label={t("setting.message_sound")}
            value={soundLabel}
            onPress={() => setShowSoundSheet(true)}
          />
          <Divider />
          <NavRow
            icon="language-outline"
            label={t("ui.language")}
            value={languageLabel}
            onPress={() => setShowLanguageSheet(true)}
          />
        </View>

        {/* Behavior */}
        <SectionHeader icon="options-outline" label={t("setting.behavior")} />
        <View className="bg-surface-card rounded-2xl mx-4 border border-secondary-light overflow-hidden">
          <SwitchRow
            icon="cloud-download-outline"
            label={t("setting.auto_download_follow_files")}
            value={autoDownloadFollow}
            onValueChange={handleAutoDownloadFollowToggle}
          />
          <Divider />
          <SwitchRow
            icon="chatbox-ellipses-outline"
            label={t("setting.auto_download_private_files")}
            value={autoDownloadPrivate}
            onValueChange={handleAutoDownloadPrivateToggle}
          />
          <Divider />
          <SwitchRow
            icon="people-outline"
            label={t("setting.auto_download_group_files")}
            value={autoDownloadGroup}
            onValueChange={handleAutoDownloadGroupToggle}
          />
        </View>

        {/* Data */}
        <SectionHeader icon="folder-outline" label={t("setting.data")} />
        <View className="bg-surface-card rounded-2xl mx-4 border border-secondary-light overflow-hidden">
          <NavRow
            icon="document-text-outline"
            label={t("setting.bulletin_cache")}
            onPress={() => navigation.navigate("BulletinManagement")}
          />
          <Divider />
          <NavRow
            icon="cloud-outline"
            label={t("setting.storage")}
            onPress={() => navigation.navigate("StorageManagement")}
          />
        </View>

        {/* Servers */}
        <SectionHeader icon="earth-outline" label={t("setting.servers")} />
        <View className="bg-surface-card rounded-2xl mx-4 border border-secondary-light overflow-hidden">
          <NavRow
            icon="wifi-outline"
            label={t("setting.connected_servers")}
            value={
              connectedCount > 0
                ? t("setting.active", { count: connectedCount })
                : t("setting.not_connected")
            }
            onPress={() => navigation.navigate("ServerManagement")}
          />
        </View>

        {/* About */}
        <SectionHeader
          icon="information-circle-outline"
          label={t("common.about")}
        />
        <View className="bg-surface-card rounded-2xl mx-4 border border-secondary-light overflow-hidden">
          <NavRow
            icon="information-circle-outline"
            label={t("setting.about_app")}
            onPress={() => navigation.navigate("About")}
          />
          <Divider />
          <View className="flex-row items-center justify-between px-4 py-3.5">
            <Text className="text-base text-text-primary">
              {t("setting.version")}
            </Text>
            <Text className="text-sm text-text-secondary">v{APP_VERSION}</Text>
          </View>
        </View>

        {/* Logout */}
        <TouchableOpacity
          onPress={handleLogout}
          activeOpacity={0.8}
          className="bg-status-success m-4 py-3.5 rounded-2xl items-center"
        >
          <Text className="text-base font-semibold text-white">
            {t("setting.logout")}
          </Text>
        </TouchableOpacity>

        {/* Account actions: copy seed / delete account */}
        <View className="flex-row gap-3 mx-4 mb-2">
          <TouchableOpacity
            onPress={handleCopySeed}
            activeOpacity={0.7}
            className="flex-1 bg-primary rounded-xl py-3 flex-row items-center justify-center gap-2"
          >
            <Ionicons name="copy-outline" size={16} color="#fff" />
            <Text className="text-sm font-medium text-white">
              {t("auth.copy_seed")}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleDelAccount}
            activeOpacity={0.7}
            className="flex-1 bg-status-error rounded-xl py-3 flex-row items-center justify-center gap-2"
          >
            <Ionicons name="trash-outline" size={16} color="#fff" />
            <Text className="text-sm font-medium text-white">
              {t("auth.remove_account")}
            </Text>
          </TouchableOpacity>
        </View>

        <View className="h-4" />
      </ScrollView>

      {/* Message sound bottom sheet */}
      <BottomSheet
        visible={showSoundSheet}
        onClose={() => setShowSoundSheet(false)}
        title={t("setting.message_sound")}
      >
        <View className="flex-row flex-wrap gap-2.5">
          {SOUND_OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt.value}
              activeOpacity={0.7}
              onPress={() => handleSoundChange(opt.value)}
              className={`flex-row items-center gap-1.5 px-4 py-2.5 rounded-xl border ${
                messageSound === opt.value
                  ? "border-primary bg-primary/10"
                  : "border-secondary-light"
              }`}
            >
              <Text className="text-base">{opt.icon}</Text>
              <Text
                className={`text-sm font-medium ${
                  messageSound === opt.value
                    ? "text-primary"
                    : "text-text-secondary"
                }`}
              >
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </BottomSheet>

      {/* Language bottom sheet */}
      <BottomSheet
        visible={showLanguageSheet}
        onClose={() => setShowLanguageSheet(false)}
        title={t("ui.language")}
        subtitle={t("ui.language_hint")}
      >
        <View className="flex-row flex-wrap gap-2.5">
          {LANGUAGE_OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt.code}
              activeOpacity={0.7}
              onPress={() => handleLanguageChange(opt.code)}
              className={`px-4 py-2.5 rounded-xl border ${
                language === opt.code
                  ? "border-primary bg-primary/10"
                  : "border-secondary-light"
              }`}
            >
              <Text
                className={`text-sm font-medium ${
                  language === opt.code ? "text-primary" : "text-text-secondary"
                }`}
              >
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </BottomSheet>

      {/* Nickname edit modal */}
      {/* QR code: address@default server */}
      <ModalShell
        visible={showQrModal}
        onClose={() => setShowQrModal(false)}
        title={t("setting.qr_code")}
      >
        <View className="items-center gap-3">
          {Address ? (
            <QrCodeView
              value={`${Address}@${ServerList[0]?.url || DefaultServer}`}
              dark={isDark}
            />
          ) : null}
        </View>
      </ModalShell>

      <ModalShell
        visible={showNicknameModal}
        onClose={() => setShowNicknameModal(false)}
        title={t("setting.edit_nickname")}
        bottom
        bottomPadding={kbHeight}
      >
        <TextInput
          value={nicknameInput}
          onChangeText={setNicknameInput}
          placeholder={t("setting.enter_nickname")}
          placeholderTextColor={PLACEHOLDER}
          className="border border-secondary-light rounded-xl px-4 py-3 text-base text-text-primary"
          autoFocus
        />
        <ConfirmButtonRow
          onConfirm={handleNicknameSave}
          confirmText={t("common.save")}
          showCancel={false}
        />
      </ModalShell>
    </View>
  );
}
