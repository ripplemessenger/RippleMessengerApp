import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  FlatList,
  RefreshControl,
  TouchableOpacity,
  Modal,
  TextInput,
} from "react-native";
import Ionicons from "react-native-vector-icons/Ionicons";
import { useDispatch, useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import { useFocusEffect } from "@react-navigation/native";

import { selectContactList } from "../selectors";
import { ACCENT } from "../lib/theme";
import AvatarImage from "../components/AvatarImage";
import {
  LoadContactList,
  ContactAdd as ContactAddAction,
} from "../store/sagas/messenger.actions";

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
            <Ionicons name="volume-high-outline" size={20} color={ACCENT} />
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
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View className="flex-1 justify-center items-center bg-black/50 px-6">
        <View className="bg-surface-card rounded-2xl p-6 w-full gap-4 border border-secondary-light">
          <Text className="text-xl font-semibold text-text-primary text-center">
            {t("ui.add_contact")}
          </Text>

          <View className="gap-1">
            <Text className="text-sm text-text-secondary">
              {t("ui.xrpl_address")}
            </Text>
            <TextInput
              value={address}
              onChangeText={setAddress}
              placeholder="r..."
              placeholderTextColor="#9a9590"
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
              placeholderTextColor="#9a9590"
              className="bg-surface border border-secondary-light rounded-xl px-4 py-3 text-text-primary text-sm"
            />
          </View>

          <View className="flex-row gap-3 mt-2">
            <TouchableOpacity
              onPress={onClose}
              activeOpacity={0.7}
              className="flex-1 py-3 rounded-xl border border-secondary-light items-center"
            >
              <Text className="text-base font-medium text-text-secondary">
                {t("common.cancel")}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleAdd}
              disabled={!address.trim()}
              activeOpacity={0.7}
              className={`flex-1 py-3 rounded-xl items-center ${
                address.trim() ? "bg-primary" : "bg-primary/20"
              }`}
            >
              <Text
                className={`text-base font-semibold ${
                  address.trim()
                    ? "text-text-primary"
                    : "text-text-secondary/50"
                }`}
              >
                {t("ui.add")}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Main ContactScreen
// ---------------------------------------------------------------------------
export default function ContactScreen({ navigation }) {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const contacts = useSelector(selectContactList);
  const refreshingRef = useRef(false);
  const [showAddModal, setShowAddModal] = useState(false);

  // Load contact list on focus
  useFocusEffect(
    useCallback(() => {
      dispatch(LoadContactList());
    }, [dispatch]),
  );

  const handleRefresh = useCallback(() => {
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    dispatch(LoadContactList());
    setTimeout(() => {
      refreshingRef.current = false;
    }, 3000);
  }, [dispatch]);

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
          <View>
            <Text className="text-xl font-bold text-text-primary">
              {t("common.contacts")}
            </Text>
            <Text className="text-xs text-text-secondary/70 mt-0.5">
              {t("contact.count_summary", {
                total: contacts.length,
                follow: followCount,
              })}
            </Text>
          </View>

          {/* Add Contact button */}
          <TouchableOpacity
            onPress={() => setShowAddModal(true)}
            activeOpacity={0.7}
            className="flex-row items-center gap-1.5 bg-primary/10 border border-primary/30 px-3 py-2 rounded-lg"
          >
            <Ionicons name="add" size={16} color={ACCENT} />
            <Text className="text-xs font-medium text-primary">
              {t("common.add_contact")}
            </Text>
          </TouchableOpacity>
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
            refreshing={refreshingRef.current}
            onRefresh={handleRefresh}
            tintColor={ACCENT}
          />
        }
        ListEmptyComponent={
          <View className="flex-1 items-center justify-center py-20 px-8">
            <Ionicons name="people-outline" size={56} color="#d4c8a8" />
            <Text className="text-xl font-bold text-text-primary mt-4 mb-2">
              {t("ui.no_contacts")}
            </Text>
            <Text className="text-sm text-text-secondary text-center">
              {t("contact.add_hint")}
            </Text>
          </View>
        }
      />

      {/* Add Contact Modal */}
      <AddContactModal
        visible={showAddModal}
        onClose={() => setShowAddModal(false)}
        onAdd={handleAdd}
      />
    </View>
  );
}
