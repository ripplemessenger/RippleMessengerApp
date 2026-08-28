import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  FlatList,
  RefreshControl,
  TouchableOpacity,
  TextInput,
  ScrollView,
} from "react-native";
import Ionicons from "react-native-vector-icons/Ionicons";
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
// Add Contact Modal
// ---------------------------------------------------------------------------
function AddContactModal({ visible, onClose, onAdd }) {
  const { t } = useTranslation();
  const [address, setAddress] = useState("");
  const [nickname, setNickname] = useState("");

  const handleAdd = () => {
    const trimmed = address.trim();
    if (!trimmed) return;
    onAdd(trimmed, nickname.trim());
    setAddress("");
    setNickname("");
    onClose();
  };

  return (
    <ModalShell visible={visible} onClose={onClose} title={t("ui.add_contact")}>
      <View className="gap-1">
        <Text className="text-sm text-text-secondary">
          {t("ui.xrpl_address")}
        </Text>
        <TextInput
          value={address}
          onChangeText={setAddress}
          placeholder="r..."
          placeholderTextColor={PLACEHOLDER}
          autoCapitalize="none"
          className="bg-surface border border-secondary-light rounded-xl px-4 py-3 text-text-primary text-sm font-mono"
        />
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
    dispatch(CreateGroupAction({ name: groupName.trim() }));
    setGroupName("");
    setShowCreateGroupModal(false);
    setSelectedMembers([]);
  }, [dispatch, groupName]);

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
                      {contact.nickname || t("common.unknown")}
                    </Text>
                    <Text className="text-xs font-mono text-text-secondary/50">
                      {shortenAddress(contact.address)}
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
