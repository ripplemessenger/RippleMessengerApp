import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  FlatList,
  RefreshControl,
  TouchableOpacity,
  TextInput,
  ScrollView,
  StyleSheet,
  Modal,
  Pressable,
} from "react-native";
import Ionicons from "react-native-vector-icons/Ionicons";
import {
  Camera,
  useCameraDevice,
  useCodeScanner,
} from "react-native-vision-camera";
import { useDispatch, useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import { useFocusEffect } from "@react-navigation/native";

import { selectContactList } from "../selectors";
import { ACCENT, PLACEHOLDER } from "../lib/theme";
import AvatarImage from "../components/AvatarImage";
import ModalShell from "../components/common/ModalShell";
import ConfirmButtonRow from "../components/common/ConfirmButtonRow";
import EmptyState from "../components/common/EmptyState";
import {
  LoadContactList,
  ContactAdd as ContactAddAction,
  CreateGroup as CreateGroupAction,
  AcceptGroupRequest as AcceptGroupRequestAction,
  RejectGroupRequest as RejectGroupRequestAction,
  ComposeMemberAdd as ComposeMemberAddAction,
  ComposeMemberDel as ComposeMemberDelAction,
} from "../store/sagas/messenger.actions";
import { selectGroupData, selectUserTabGroup } from "../selectors";
import { GroupMemberMax } from "../lib/MessengerConst";
import { shortenAddress, formatTime } from "../lib/format";

/**
 * ContactScreen — contact list for the Contact tab (3rd bottom tab).
 *
 * Features:
 * - FlatList of contacts with avatar, nickname, address, follow badge
 * - Tap contact → open private chat (ChatDetail)
 * - "Add Contact" button opens modal (address + optional nickname)
 * - Delete contact with confirm alert
 * - Pull-to-refresh reloads contact list from database
 * - Empty state when no contacts exist
 */

// ---------------------------------------------------------------------------
// Contact Card Component
// ---------------------------------------------------------------------------
function ContactCard({ contact, onOpenDetail, onViewBulletins, onStartChat }) {
  const { t } = useTranslation();
  return (
    <View className="bg-surface-card rounded-xl p-3 border border-secondary-light mb-2">
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={() => onOpenDetail(contact)}
        className="flex-row items-center gap-2"
      >
        <AvatarImage
          address={contact.address}
          nickname={contact.nickname}
          size={36}
        />

        <View className="flex-1 min-w-0">
          <Text className="text-base font-medium text-text-primary truncate">
            {contact.nickname || t("common.unknown")}
          </Text>
          <Text className="text-xs font-mono text-text-secondary/70 truncate">
            {contact.address}
          </Text>
        </View>

        {/* Bulletin icon (if follow) */}
        {contact.is_follow && (
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => onViewBulletins(contact)}
            className="p-2"
          >
            <Ionicons name="newspaper-outline" size={20} color={ACCENT} />
          </TouchableOpacity>
        )}

        {/* Chat icon (if friend) */}
        {contact.is_friend && (
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => onStartChat(contact)}
            className="p-2"
          >
            <Ionicons name="chatbubbles-outline" size={20} color={ACCENT} />
          </TouchableOpacity>
        )}
      </TouchableOpacity>
    </View>
  );
}

// ---------------------------------------------------------------------------
// QR Scanner
// ---------------------------------------------------------------------------

/**
 * Parse a scanned QR value into a contact address.
 * QR encodes `address@server` (or just `address`). Returns the address part.
 */
function parseScannedQr(value) {
  const v = (value || "").trim();
  if (!v) return "";
  if (v.includes("@")) {
    return v.split("@")[0].trim();
  }
  return v;
}

/**
 * QrScannerModal — full-screen camera QR scanner.
 *
 * Opens the back camera, detects QR codes in real time (including inverted
 * QRs via checkInverted), and calls onScan(rawValue) on the first detection.
 */
function QrScannerModal({ visible, onClose, onScan }) {
  const { t } = useTranslation();
  const device = useCameraDevice("back");
  const [scanned, setScanned] = useState(false);
  const [permission, setPermission] = useState(null);

  // Built-in code scanner (platform-native, no frame processor needed).
  // onCodeScanned fires for each frame with a detected code; we only act once.
  const codeScanner = useCodeScanner({
    codeTypes: ["qr"],
    onCodeScanned: (codes) => {
      if (codes.length > 0 && !scanned) {
        const value = codes[0].value;
        if (value) {
          setScanned(true);
          onScan(value);
        }
      }
    },
  });

  // Request camera permission + reset scan state each time the scanner opens
  const requestPermission = useCallback(() => {
    setScanned(false);
    setPermission(null);
    Camera.requestCameraPermission()
      .then((p) => setPermission(p === "granted"))
      .catch(() => setPermission(false));
  }, []);

  useEffect(() => {
    if (visible) requestPermission();
  }, [visible, requestPermission]);

  if (!visible) return null;

  const showCamera = device && permission;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "#000" }}>
        {showCamera ? (
          <Camera
            style={StyleSheet.absoluteFill}
            device={device}
            isActive={true}
            codeScanner={codeScanner}
          />
        ) : (
          <View
            style={{
              flex: 1,
              justifyContent: "center",
              alignItems: "center",
              padding: 32,
            }}
          >
            <Ionicons name="camera-outline" size={48} color="#888" />
            <Text style={{ color: "#ccc", marginTop: 12, textAlign: "center" }}>
              {device ? t("setting.camera_denied") : t("setting.no_camera")}
            </Text>
            {device && (
              <TouchableOpacity
                onPress={requestPermission}
                style={{
                  marginTop: 16,
                  paddingHorizontal: 20,
                  paddingVertical: 10,
                  backgroundColor: "rgba(255,255,255,0.1)",
                  borderRadius: 8,
                }}
              >
                <Text style={{ color: "#fff", fontSize: 14 }}>
                  {t("setting.retry")}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Overlay: top bar + scan frame + hint */}
        <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              paddingHorizontal: 16,
              paddingTop: 48,
              paddingBottom: 12,
              backgroundColor: "rgba(0,0,0,0.4)",
            }}
          >
            <Text style={{ color: "#fff", fontSize: 18, fontWeight: "600" }}>
              {t("setting.scan_qr")}
            </Text>
            <Pressable
              onPress={onClose}
              style={{
                width: 36,
                height: 36,
                borderRadius: 18,
                backgroundColor: "rgba(255,255,255,0.2)",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Ionicons name="close" size={22} color="#fff" />
            </Pressable>
          </View>
          <View
            style={{
              flex: 1,
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <View
              style={{
                width: 240,
                height: 240,
                borderWidth: 2,
                borderColor: "rgba(255,255,255,0.85)",
                borderRadius: 16,
              }}
            />
          </View>
          <View style={{ alignItems: "center", paddingBottom: 60 }}>
            <Text style={{ color: "rgba(255,255,255,0.8)", fontSize: 14 }}>
              {t("setting.scan_hint")}
            </Text>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Add Contact Modal
// ---------------------------------------------------------------------------
function AddContactModal({ visible, onClose, onAdd, scanResult }) {
  const { t } = useTranslation();
  const [address, setAddress] = useState("");
  const [nickname, setNickname] = useState("");

  // Sync a freshly-scanned address into the field (scanResult is a new object
  // each scan, so this fires even when the same address is scanned twice)
  useEffect(() => {
    if (scanResult && scanResult.address) {
      setAddress(scanResult.address);
    }
  }, [scanResult]);

  const handleAdd = () => {
    const trimmed = address.trim();
    if (!trimmed) return;
    onAdd(trimmed, nickname.trim());
    setAddress("");
    setNickname("");
    onClose();
  };

  return (
    <ModalShell
      visible={visible}
      onClose={onClose}
      title={t("common.add_contact")}
    >
      <View className="gap-1">
        <Text className="text-sm text-text-secondary">
          {t("ui.xrpl_address")}
        </Text>
        <View className="flex-row items-center gap-2">
          <TextInput
            value={address}
            onChangeText={setAddress}
            placeholder="r..."
            placeholderTextColor={PLACEHOLDER}
            autoCapitalize="none"
            className="flex-1 bg-surface border border-secondary-light rounded-xl px-4 py-3 text-text-primary text-sm font-mono"
          />
        </View>
      </View>

      <View className="gap-1">
        <Text className="text-sm text-text-secondary">
          {t("ui.nickname_optional")}
        </Text>
        <TextInput
          value={nickname}
          onChangeText={setNickname}
          placeholder={t("ui.nickname")}
          placeholderTextColor={PLACEHOLDER}
          className="bg-surface border border-secondary-light rounded-xl px-4 py-3 text-text-primary text-sm"
        />
      </View>

      <ConfirmButtonRow
        onConfirm={handleAdd}
        confirmText={t("ui.add")}
        confirmDisabled={!address.trim()}
        showCancel={false}
      />
    </ModalShell>
  );
}

// ---------------------------------------------------------------------------
// Main ContactScreen
// ---------------------------------------------------------------------------
export default function ContactScreen({ navigation }) {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const contacts = useSelector(selectContactList);
  const { GroupRequestList } = useSelector(selectGroupData);
  const { ContactList: userContacts } = useSelector(selectUserTabGroup);
  const [refreshing, setRefreshing] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showCreateGroupModal, setShowCreateGroupModal] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [scanResult, setScanResult] = useState(null);

  // Handle a scanned QR: parse the address, store it, close the scanner,
  // and open the Add Contact modal with the address pre-filled.
  const handleScanResult = useCallback((value) => {
    const addr = parseScannedQr(value);
    if (addr) {
      setScanResult({ address: addr, token: Date.now() });
      setShowAddModal(true);
    }
    setShowScanner(false);
  }, []);

  // Auto-close invite modal when list becomes empty
  useEffect(() => {
    if (showInviteModal && GroupRequestList.length === 0) {
      setShowInviteModal(false);
    }
  }, [showInviteModal, GroupRequestList.length]);
  const [groupName, setGroupName] = useState("");
  const [selectedMembers, setSelectedMembers] = useState([]);

  // Load contact list on focus
  useFocusEffect(
    useCallback(() => {
      dispatch(LoadContactList());
    }, [dispatch]),
  );

  const handleRefresh = useCallback(() => {
    if (refreshing) return;
    setRefreshing(true);
    dispatch(LoadContactList());
    setTimeout(() => {
      setRefreshing(false);
    }, 3000);
  }, [dispatch, refreshing]);

  const handleOpenDetail = useCallback(
    (contact) => {
      navigation.navigate("ContactDetail", { address: contact.address });
    },
    [navigation],
  );

  const handleViewBulletins = useCallback(
    (contact) => {
      navigation.getParent().navigate("AddressBulletins", {
        address: contact.address,
      });
    },
    [navigation],
  );

  const handleStartChat = useCallback(
    (contact) => {
      navigation.getParent().navigate("ChatDetail", {
        session: {
          address: contact.address,
          nickname: contact.nickname || contact.address,
          is_friend: true,
        },
      });
    },
    [navigation],
  );

  const handleAdd = useCallback(
    (address, nickname) => {
      dispatch(ContactAddAction({ address, nickname }));
    },
    [dispatch],
  );

  // --- Group functions ---
  const handleCreateGroup = useCallback(() => {
    if (!groupName.trim()) return;
    if (selectedMembers.length < 2) return;
    dispatch(CreateGroupAction({ name: groupName.trim() }));
    setGroupName("");
    setShowCreateGroupModal(false);
    setSelectedMembers([]);
  }, [dispatch, groupName, selectedMembers]);

  const onToggleMember = useCallback(
    (address) => {
      setSelectedMembers((prev) => {
        const isSelected = prev.includes(address);
        if (isSelected) {
          dispatch(ComposeMemberDelAction({ address }));
          return prev.filter((a) => a !== address);
        } else {
          dispatch(ComposeMemberAddAction({ address }));
          const next = [address, ...prev];
          return next.length > GroupMemberMax
            ? next.slice(0, GroupMemberMax)
            : next;
        }
      });
    },
    [dispatch],
  );

  const handleAcceptInvite = useCallback(
    (group) => {
      dispatch(AcceptGroupRequestAction({ hash: group.hash }));
    },
    [dispatch],
  );

  const handleRejectInvite = useCallback(
    (group) => {
      dispatch(RejectGroupRequestAction({ hash: group.hash }));
    },
    [dispatch],
  );

  const renderItem = useCallback(
    ({ item }) => (
      <ContactCard
        contact={item}
        onOpenDetail={handleOpenDetail}
        onViewBulletins={handleViewBulletins}
        onStartChat={handleStartChat}
      />
    ),
    [handleOpenDetail, handleViewBulletins, handleStartChat],
  );

  const keyExtractor = useCallback((item) => item.address, []);

  const followCount = useMemo(
    () => contacts.filter((c) => c.is_follow).length,
    [contacts],
  );

  return (
    <View className="flex-1 bg-surface">
      {/* Header bar */}
      <View className="px-4 py-3 bg-primary/5 border-b border-secondary-light/30">
        <View className="flex-row items-center justify-between">
          <Text className="text-xl font-bold text-text-primary">
            {t("common.contacts")}
          </Text>
          <Text className="text-xs text-text-secondary/50">
            {t("contact.count_summary", {
              total: contacts.length,
              follow: followCount,
            })}
          </Text>
        </View>
        <View className="flex-row items-center gap-2 mt-2">
          <TouchableOpacity
            onPress={() => setShowAddModal(true)}
            activeOpacity={0.7}
            className="w-10 h-10 rounded-full bg-primary/10 items-center justify-center"
          >
            <Ionicons name="person-add" size={20} color={ACCENT} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setShowScanner(true)}
            activeOpacity={0.7}
            className="w-10 h-10 rounded-full bg-primary/10 items-center justify-center"
          >
            <Ionicons name="qr-code-outline" size={20} color={ACCENT} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setShowCreateGroupModal(true)}
            activeOpacity={0.7}
            className="w-10 h-10 rounded-full bg-primary/10 items-center justify-center"
          >
            <Ionicons name="people" size={20} color={ACCENT} />
          </TouchableOpacity>
          {GroupRequestList.length > 0 && (
            <TouchableOpacity
              onPress={() => setShowInviteModal(true)}
              activeOpacity={0.7}
              className="w-10 h-10 rounded-full bg-primary/10 items-center justify-center relative"
            >
              <Ionicons name="mail" size={20} color={ACCENT} />
              <View className="absolute -top-1 -right-1 w-5 h-5 bg-status-error rounded-full items-center justify-center">
                <Text className="text-[10px] font-bold text-white">
                  {GroupRequestList.length}
                </Text>
              </View>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Contact list */}
      <FlatList
        data={contacts}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        contentContainerStyle={{ padding: 16, gap: 12, flexGrow: 1 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={ACCENT}
          />
        }
        ListEmptyComponent={
          <EmptyState
            icon="people-outline"
            title={t("ui.no_contacts")}
            hint={t("contact.add_hint")}
          />
        }
      />

      {/* Add Contact Modal */}
      <AddContactModal
        visible={showAddModal}
        onClose={() => setShowAddModal(false)}
        onAdd={handleAdd}
        scanResult={scanResult}
      />

      {/* QR Scanner (rendered after AddContactModal so it appears on top) */}
      <QrScannerModal
        visible={showScanner}
        onClose={() => setShowScanner(false)}
        onScan={handleScanResult}
      />

      {/* Create Group Modal */}
      <ModalShell
        visible={showCreateGroupModal}
        onClose={() => setShowCreateGroupModal(false)}
        title={t("common.create_group")}
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          style={{ maxHeight: "60%" }}
        >
          <View className="gap-1">
            <Text className="text-sm text-text-secondary">
              {t("group.name")}
            </Text>
            <TextInput
              value={groupName}
              onChangeText={setGroupName}
              placeholder={t("group.name_placeholder")}
              placeholderTextColor={PLACEHOLDER}
              className="bg-surface border border-secondary-light rounded-xl px-4 py-3 text-text-primary text-sm"
            />
          </View>
          <View className="flex-row items-center justify-between">
            <Text className="text-sm text-text-secondary">
              {t("group.select_members")} ({selectedMembers.length}/
              {GroupMemberMax})
            </Text>
            {selectedMembers.length > 0 && (
              <TouchableOpacity onPress={() => setSelectedMembers([])}>
                <Text className="text-xs text-status-error">
                  {t("group.clear_all")}
                </Text>
              </TouchableOpacity>
            )}
          </View>
          <View>
            {(userContacts || []).length > 0 ? (
              (userContacts || []).map((contact) => {
                const isSelected = selectedMembers.includes(contact.address);
                return (
                  <TouchableOpacity
                    key={contact.address}
                    onPress={() => onToggleMember(contact.address)}
                    className={`flex-row items-center gap-3 py-3 px-2 rounded-xl ${
                      isSelected ? "bg-primary/10" : ""
                    }`}
                  >
                    <View
                      className={`w-6 h-6 rounded-full border-2 items-center justify-center ${
                        isSelected
                          ? "border-primary bg-primary"
                          : "border-text-secondary/40"
                      }`}
                    >
                      {isSelected && (
                        <Ionicons name="checkmark" size={14} color="#fff" />
                      )}
                    </View>
                    <Text className="text-sm text-text-primary flex-1">
                      {contact.nickname || shortenAddress(contact.address)}
                    </Text>
                  </TouchableOpacity>
                );
              })
            ) : (
              <View className="py-6 items-center">
                <Ionicons
                  name="people-outline"
                  size={32}
                  color={PLACEHOLDER}
                  opacity={0.4}
                />
                <Text className="text-sm text-text-secondary/60 mt-2">
                  {t("group.no_contacts")}
                </Text>
              </View>
            )}
          </View>
        </ScrollView>
        <ConfirmButtonRow
          onConfirm={handleCreateGroup}
          confirmText={t("group.create")}
          confirmDisabled={selectedMembers.length < 2}
          showCancel={false}
        />
      </ModalShell>

      {/* Pending Invitations Modal */}
      <ModalShell
        visible={showInviteModal}
        onClose={() => setShowInviteModal(false)}
        title={t("group.pending_invitations", {
          count: GroupRequestList.length,
        })}
      >
        <ScrollView showsVerticalScrollIndicator={false}>
          <View className="gap-3">
            {GroupRequestList.map((group) => {
              const inviter = group.created_by;
              const inviterContact = (contacts || []).find(
                (c) => c.address === inviter,
              );
              const inviterName =
                inviterContact?.nickname || shortenAddress(inviter);
              return (
                <View
                  key={group.hash}
                  className="bg-surface rounded-xl p-3 border border-secondary-light border-l-4 border-l-status-warning"
                >
                  <Text className="text-base font-medium text-text-primary truncate">
                    {group.name || t("group.unnamed")}
                  </Text>
                  <View className="flex-row items-center gap-3 mt-2">
                    <Text className="text-xs text-text-secondary flex-1">
                      {t("group.invited_by", { name: inviterName })}
                    </Text>
                    <Text className="text-xs text-text-secondary">
                      {group.member?.length || 0}
                      {t("group.members_suffix")}
                    </Text>
                  </View>
                  <Text className="text-xs text-text-secondary/60 mt-1">
                    {formatTime(group.created_at)}
                  </Text>
                  <View className="flex-row gap-3 mt-3">
                    <TouchableOpacity
                      onPress={() => {
                        handleAcceptInvite(group);
                      }}
                      className="flex-1 bg-status-success py-2 rounded-lg items-center"
                    >
                      <Text className="text-sm font-medium text-white">
                        {t("group.accept")}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => {
                        handleRejectInvite(group);
                      }}
                      className="flex-1 bg-status-error py-2 rounded-lg items-center"
                    >
                      <Text className="text-sm font-medium text-white">
                        {t("group.decline")}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </View>
        </ScrollView>
      </ModalShell>
    </View>
  );
}
