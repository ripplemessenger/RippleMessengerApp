import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Alert,
  TextInput,
  FlatList,
} from "react-native";
import { useSelector, useDispatch } from "react-redux";
import { useTranslation } from "react-i18next";
import { useNavigation } from "@react-navigation/native";
import Ionicons from "react-native-vector-icons/Ionicons";
import { ACCENT, ICON_MUTED } from "../lib/theme";
import { formatTime, shortenAddress } from "../lib/format";
import ModalShell from "./common/ModalShell";
import ConfirmButtonRow from "./common/ConfirmButtonRow";

import { selectGroupData, selectUserTabGroup } from "../selectors";
import { GroupMemberMax } from "../lib/MessengerConst";
import {
  CreateGroup as CreateGroupAction,
  DeleteGroup as DeleteGroupAction,
  AcceptGroupRequest as AcceptGroupRequestAction,
  RejectGroupRequest as RejectGroupRequestAction,
  ComposeMemberAdd as ComposeMemberAddAction,
  ComposeMemberDel as ComposeMemberDelAction,
} from "../store/sagas/messenger.actions";

/**
 * GroupManagementTab — manage groups: create (with member selection),
 * delete, and accept/decline pending invitations.
 * Extracted from SettingScreen so it can be a standalone full-screen route.
 */
export default function GroupManagementTab() {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const dispatch = useDispatch();
  const { GroupList, GroupRequestList } = useSelector(selectGroupData);
  const { ContactList: userContacts } = useSelector(selectUserTabGroup);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [selectedMembers, setSelectedMembers] = useState([]);

  // --- Create group ---
  const handleCreateGroup = useCallback(() => {
    if (!groupName.trim()) {
      Alert.alert(t("common.error"), t("group.name_required"));
      return;
    }
    dispatch(CreateGroupAction({ name: groupName.trim() }));
    setGroupName("");
    setShowCreateModal(false);
    setSelectedMembers([]);
  }, [dispatch, groupName]);

  const closeCreateModal = useCallback(() => {
    setShowCreateModal(false);
    setSelectedMembers([]);
    setGroupName("");
  }, []);

  // Toggle member selection and sync with saga
  const onToggleMemberWithSaga = useCallback(
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

  // --- Delete group ---
  const handleDeleteGroup = useCallback(
    (group) => {
      Alert.alert(
        t("group.delete_title"),
        t("group.delete_confirm", { name: group.name || t("group.unnamed") }),
        [
          { text: t("common.cancel"), style: "cancel" },
          {
            text: t("common.delete"),
            style: "destructive",
            onPress: () => dispatch(DeleteGroupAction({ hash: group.hash })),
          },
        ],
      );
    },
    [dispatch],
  );

  // --- Accept group invitation ---
  const handleAcceptRequest = useCallback(
    (group) => {
      dispatch(AcceptGroupRequestAction({ hash: group.hash }));
    },
    [dispatch],
  );

  // --- Reject group invitation ---
  const handleRejectRequest = useCallback(
    (group) => {
      Alert.alert(
        t("group.decline_title"),
        t("group.decline_confirm", { name: group.name || t("group.unnamed") }),
        [
          { text: t("common.cancel"), style: "cancel" },
          {
            text: t("group.decline_title"),
            style: "destructive",
            onPress: () =>
              dispatch(RejectGroupRequestAction({ hash: group.hash })),
          },
        ],
      );
    },
    [dispatch],
  );

  // --- Renderers ---
  const renderGroupItem = useCallback(
    ({ item: group }) => {
      const memberCount = group.member ? group.member.length + 1 : 0;
      const createdAt = group.created_at ? formatTime(group.created_at) : "-";

      return (
        <TouchableOpacity
          onLongPress={() => handleDeleteGroup(group)}
          delayLongPress={500}
          activeOpacity={0.7}
          className="bg-surface-card rounded-xl p-4 border border-secondary-light"
        >
          <View className="flex-row items-center gap-3 mb-2">
            <View className="w-10 h-10 rounded-full bg-primary/20 items-center justify-center">
              <Ionicons name="people" size={20} color={ACCENT} />
            </View>
            <View className="flex-1 min-w-0">
              <Text className="text-base font-semibold text-text-primary truncate">
                {group.name || "Unnamed Group"}
              </Text>
              <Text className="text-xs text-text-secondary/70">
                {memberCount} members
              </Text>
            </View>
            <TouchableOpacity onPress={() => handleDeleteGroup(group)}>
              <Ionicons name="trash-outline" size={18} color="#ef4444" />
            </TouchableOpacity>
          </View>
          <Text className="text-xs text-text-secondary/60">
            Created {createdAt}
          </Text>
        </TouchableOpacity>
      );
    },
    [handleDeleteGroup],
  );

  const renderRequestItem = useCallback(
    ({ item: group }) => (
      <View className="bg-surface-card rounded-xl p-4 border border-secondary-light border-l-4 border-l-status-warning">
        <View className="flex-row items-center gap-3 mb-2">
          <View className="w-10 h-10 rounded-full bg-status-warning/20 items-center justify-center">
            <Ionicons name="mail" size={20} color="#d4a017" />
          </View>
          <View className="flex-1 min-w-0">
            <Text className="text-base font-medium text-text-primary truncate">
              {group.name || "Unnamed Group"}
            </Text>
            <Text className="text-xs text-status-warning">
              Pending invitation
            </Text>
          </View>
        </View>
        <View className="flex-row gap-3 mt-2">
          <TouchableOpacity
            onPress={() => handleAcceptRequest(group)}
            className="flex-1 bg-status-success py-2 rounded-lg items-center"
          >
            <Text className="text-sm font-medium text-white">
              {t("group.accept")}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => handleRejectRequest(group)}
            className="flex-1 bg-status-error py-2 rounded-lg items-center"
          >
            <Text className="text-sm font-medium text-white">
              {t("group.decline")}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    ),
    [handleAcceptRequest, handleRejectRequest],
  );

  return (
    <View className="flex-1 gap-4 bg-surface">
      {/* Header */}
      <View className="flex-row items-center px-3 py-2 bg-primary/5 border-b border-secondary-light/30">
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          activeOpacity={0.6}
        >
          <Ionicons name="arrow-back" size={24} color={ICON_MUTED} />
        </TouchableOpacity>
        <Text
          className="text-lg font-semibold text-text-primary flex-1 ml-2"
          numberOfLines={1}
        >
          {t("setting.my_groups")}
        </Text>
      </View>

      {/* Create Group Modal */}
      <ModalShell
        visible={showCreateModal}
        onClose={closeCreateModal}
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
              placeholderTextColor="#9a9590"
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
                    onPress={() => onToggleMemberWithSaga(contact.address)}
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
                  color="#9a9590"
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

      {/* Pending Invitations */}
      {GroupRequestList.length > 0 && (
        <View className="gap-3">
          <View className="flex-row items-center gap-2 px-1">
            <Ionicons name="mail" size={16} color="#d4a017" />
            <Text className="text-sm font-semibold text-status-warning">
              Pending Invitations ({GroupRequestList.length})
            </Text>
          </View>
          {GroupRequestList.map((group) => renderRequestItem({ item: group }))}
        </View>
      )}

      {/* Group List */}
      {GroupList.length > 0 ? (
        <FlatList
          data={GroupList}
          keyExtractor={(item) => item.hash}
          renderItem={renderGroupItem}
          contentContainerClassName="gap-3 pb-4"
          showsVerticalScrollIndicator={false}
        />
      ) : (
        <View className="flex-1 items-center justify-center gap-3">
          <Ionicons
            name="people-circle-outline"
            size={48}
            color={ACCENT}
            opacity={0.4}
          />
          <Text className="text-lg text-text-secondary">No groups yet</Text>
          <Text className="text-sm text-text-secondary/60 text-center px-8">
            Groups you create or join will appear here
          </Text>
        </View>
      )}

      {/* Create group button */}
      <TouchableOpacity
        onPress={() => setShowCreateModal(true)}
        className="bg-primary py-3 rounded-xl items-center"
      >
        <Text className="text-base font-semibold text-text-primary">
          Create Group
        </Text>
      </TouchableOpacity>
    </View>
  );
}
