import React, { useState, useCallback, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  Modal,
  Switch,
  Keyboard,
} from "react-native";
import { useSelector, useDispatch } from "react-redux";
import Ionicons from "react-native-vector-icons/Ionicons";

import RNFS from "react-native-fs";
import AvatarImage from "../components/AvatarImage";
import useDarkMode from "../hooks/useDarkMode";
import * as fileService from "../services/fileService";
import { pickImage } from "../services/mediaPicker";
import { selectUserTabMe, selectConnectedServerCount } from "../selectors";
import { logoutStart, setNickname } from "../store/slices/UserSlice";
import { SaveSelfAvatar, ContactAdd } from "../store/sagas/messenger.actions";
import { FileHash, base64ToUint8Array } from "../lib/MessengerUtil";
import {
  getSettingBool,
  getSettingString,
  setSetting,
} from "../lib/SettingsUtil";
import { previewSound } from "../lib/SoundUtil";

const APP_VERSION = "1.0.0";

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
function SectionHeader({ icon, label, iconColor = "#e6b420" }) {
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
function NavRow({ icon, iconColor = "#e6b420", label, value, onPress }) {
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
function SwitchRow({
  icon,
  iconColor = "#e6b420",
  label,
  value,
  onValueChange,
}) {
  return (
    <View className="flex-row items-center gap-3 px-4 py-3.5">
      <View className="w-8 h-8 rounded-lg bg-primary/10 items-center justify-center">
        <Ionicons name={icon} size={18} color={iconColor} />
      </View>
      <Text className="flex-1 text-base text-text-primary">{label}</Text>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: "#d4c8a8", true: "#e6b420" }}
        thumbColor={value ? "#fff" : "#f4f3f4"}
      />
    </View>
  );
}

function Divider() {
  return <View className="h-px bg-secondary-light/40 mx-4" />;
}

// ---------------------------------------------------------------------------
// SettingScreen — mobile settings list (single scroll, sections, sub-screens)
// ---------------------------------------------------------------------------
export default function SettingScreen({ navigation }) {
  const dispatch = useDispatch();
  const { Address, Nickname } = useSelector(selectUserTabMe);
  const connectedCount = useSelector(selectConnectedServerCount);
  const { isDark, toggle } = useDarkMode();

  // --- Nickname edit ---
  const [showNicknameModal, setShowNicknameModal] = useState(false);
  const [nicknameInput, setNicknameInput] = useState("");
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
    Alert.alert("Change Avatar", "Select a photo from your library.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Photo Library",
        onPress: async () => {
          setAvatarLoading(true);
          try {
            const image = await pickImage();
            if (!image) {
              setAvatarLoading(false);
              return;
            }
            const base64Data = await RNFS.readFile(image.uri, "base64");
            const content = base64ToUint8Array(base64Data);
            const hash = FileHash(content);
            const size = image.fileSize || content.length;
            await fileService.writeFile(
              fileService.getAvatarPath(Address),
              content,
            );
            dispatch(SaveSelfAvatar({ hash, size, timestamp: Date.now() }));
          } catch (e) {
            Alert.alert("Avatar", e.message || "Failed to upload avatar");
          } finally {
            setAvatarLoading(false);
          }
        },
      },
    ]);
  }, [Address, dispatch, avatarLoading]);

  // --- Logout ---
  const handleLogout = useCallback(() => {
    Alert.alert("Logout", "Are you sure you want to logout?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Logout",
        style: "destructive",
        onPress: () => dispatch(logoutStart()),
      },
    ]);
  }, [dispatch]);

  // --- Notifications + sound (persisted via SettingsUtil) ---
  const [enableNotifications, setEnableNotifications] = useState(true);
  const [messageSound, setMessageSound] = useState("chime");
  const [showSoundSheet, setShowSoundSheet] = useState(false);

  // --- Auto-download settings (persisted via SettingsUtil) ---
  const [autoDownloadFollow, setAutoDownloadFollow] = useState(true);
  const [autoDownloadPrivate, setAutoDownloadPrivate] = useState(true);
  const [autoDownloadGroup, setAutoDownloadGroup] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [notif, sound, follow, priv, group] = await Promise.all([
          getSettingBool("enableNotifications", true),
          getSettingString("messageSound", "chime"),
          getSettingBool("autoDownloadFollowFiles", true),
          getSettingBool("autoDownloadPrivateFiles", true),
          getSettingBool("autoDownloadGroupFiles", true),
        ]);
        setEnableNotifications(notif);
        setMessageSound(sound);
        setAutoDownloadFollow(follow);
        setAutoDownloadPrivate(priv);
        setAutoDownloadGroup(group);
      } catch {
        // use defaults
      }
    })();
  }, []);

  const handleNotificationToggle = useCallback(async (value) => {
    setEnableNotifications(value);
    try {
      await setSetting("enableNotifications", value);
    } catch {
      // fail silently
    }
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

  return (
    <View className="flex-1 bg-surface">
      {/* Header */}
      <View className="px-5 pt-14 pb-2">
        <Text className="text-3xl font-bold text-text-primary text-center">
          Settings
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
                {Nickname || "No nickname"}
              </Text>
              <Ionicons name="create-outline" size={16} color="#a89f85" />
            </TouchableOpacity>
            {Address ? (
              <Text className="text-xs font-mono text-text-secondary/70 truncate">
                {Address.slice(0, 10)}...{Address.slice(-6)}
              </Text>
            ) : null}
          </View>
        </View>

        {/* Preferences */}
        <SectionHeader icon="color-palette-outline" label="Preferences" />
        <View className="bg-surface-card rounded-2xl mx-4 border border-secondary-light overflow-hidden">
          <SwitchRow
            icon={isDark ? "moon" : "sunny"}
            label="Dark Mode"
            value={isDark}
            onValueChange={toggle}
          />
          <Divider />
          <SwitchRow
            icon="notifications-outline"
            label="Notifications"
            value={enableNotifications}
            onValueChange={handleNotificationToggle}
          />
          <Divider />
          <NavRow
            icon="volume-high-outline"
            label="Message Sound"
            value={soundLabel}
            onPress={() => setShowSoundSheet(true)}
          />
          <Divider />
          <SwitchRow
            icon="cloud-download-outline"
            label="Auto-download Followed Files"
            value={autoDownloadFollow}
            onValueChange={handleAutoDownloadFollowToggle}
          />
          <Divider />
          <SwitchRow
            icon="chatbox-ellipses-outline"
            label="Auto-download Private Chat Files"
            value={autoDownloadPrivate}
            onValueChange={handleAutoDownloadPrivateToggle}
          />
          <Divider />
          <SwitchRow
            icon="people-outline"
            label="Auto-download Group Chat Files"
            value={autoDownloadGroup}
            onValueChange={handleAutoDownloadGroupToggle}
          />
        </View>

        {/* Data */}
        <SectionHeader icon="folder-outline" label="Data" />
        <View className="bg-surface-card rounded-2xl mx-4 border border-secondary-light overflow-hidden">
          <NavRow
            icon="document-text-outline"
            label="Bulletin Cache"
            onPress={() => navigation.navigate("BulletinManagement")}
          />
          <Divider />
          <NavRow
            icon="cloud-outline"
            label="File Storage"
            onPress={() => navigation.navigate("StorageManagement")}
          />
        </View>

        {/* Content */}
        <SectionHeader icon="bookmark-outline" label="Content" />
        <View className="bg-surface-card rounded-2xl mx-4 border border-secondary-light overflow-hidden">
          <NavRow
            icon="bookmark-outline"
            label="Bookmarked Posts"
            onPress={() => navigation.navigate("BookmarkBulletins")}
          />
          <Divider />
          <NavRow
            icon="star-outline"
            label="Followed Posts"
            onPress={() => navigation.navigate("FollowedBulletins")}
          />
          <Divider />
          <NavRow
            icon="shuffle-outline"
            label="Random Posts"
            onPress={() => navigation.navigate("RandomBulletins")}
          />
        </View>

        {/* Groups */}
        <SectionHeader icon="people-circle-outline" label="Groups" />
        <View className="bg-surface-card rounded-2xl mx-4 border border-secondary-light overflow-hidden">
          <NavRow
            icon="people-outline"
            label="My Groups"
            onPress={() => navigation.navigate("GroupManagement")}
          />
        </View>

        {/* Servers */}
        <SectionHeader icon="earth-outline" label="Servers" />
        <View className="bg-surface-card rounded-2xl mx-4 border border-secondary-light overflow-hidden">
          <NavRow
            icon="wifi-outline"
            label="Connected Servers"
            value={
              connectedCount > 0 ? `${connectedCount} active` : "Not connected"
            }
            onPress={() => navigation.navigate("ServerManagement")}
          />
        </View>

        {/* About */}
        <SectionHeader icon="information-circle-outline" label="About" />
        <View className="bg-surface-card rounded-2xl mx-4 border border-secondary-light overflow-hidden">
          <NavRow
            icon="information-circle-outline"
            label="About RippleMessenger"
            onPress={() => navigation.navigate("About")}
          />
          <Divider />
          <View className="flex-row items-center justify-between px-4 py-3.5">
            <Text className="text-base text-text-primary">Version</Text>
            <Text className="text-sm text-text-secondary">v{APP_VERSION}</Text>
          </View>
        </View>

        {/* Logout */}
        <TouchableOpacity
          onPress={handleLogout}
          activeOpacity={0.8}
          className="bg-status-error m-4 py-3.5 rounded-2xl items-center"
        >
          <Text className="text-base font-semibold text-white">Logout</Text>
        </TouchableOpacity>

        <View className="h-4" />
      </ScrollView>

      {/* Message sound bottom sheet */}
      <Modal
        visible={showSoundSheet}
        transparent
        animationType="slide"
        onRequestClose={() => setShowSoundSheet(false)}
      >
        <View className="flex-1 justify-end bg-black/50">
          <View className="bg-surface-card rounded-t-3xl p-5 pb-8 border-t border-secondary-light">
            <View className="w-10 h-1 bg-secondary-light rounded-full mx-auto mb-4" />
            <Text className="text-lg font-semibold text-text-primary text-center mb-4">
              Message Sound
            </Text>
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
            <TouchableOpacity
              onPress={() => setShowSoundSheet(false)}
              className="mt-5 py-3 rounded-xl border border-secondary-light items-center"
            >
              <Text className="text-base font-medium text-text-secondary">
                Cancel
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Nickname edit modal */}
      <Modal
        visible={showNicknameModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowNicknameModal(false)}
      >
        <View
          className="flex-1 bg-black/50 px-6"
          style={{
            justifyContent: "flex-end",
            paddingBottom: kbHeight + 24,
          }}
        >
          <View className="bg-surface-card rounded-2xl p-5">
            <Text className="text-lg font-semibold text-text-primary mb-3">
              Edit Nickname
            </Text>
            <TextInput
              value={nicknameInput}
              onChangeText={setNicknameInput}
              placeholder="Enter nickname..."
              placeholderTextColor="#999"
              className="border border-secondary-light rounded-xl px-4 py-3 text-base text-text-primary mb-4"
              autoFocus
            />
            <View className="flex-row gap-3">
              <TouchableOpacity
                onPress={() => setShowNicknameModal(false)}
                className="flex-1 py-3 rounded-xl border border-secondary-light items-center"
              >
                <Text className="text-base text-text-secondary">Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleNicknameSave}
                className="flex-1 py-3 rounded-xl bg-primary items-center"
              >
                <Text className="text-base font-medium text-white">Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
