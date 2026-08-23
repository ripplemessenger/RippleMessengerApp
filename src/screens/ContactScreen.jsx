import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  FlatList,
  RefreshControl,
  TouchableOpacity,
  Modal,
  TextInput,
  Alert,
} from "react-native";
import Ionicons from "react-native-vector-icons/Ionicons";
import { useDispatch, useSelector } from "react-redux";
import { useFocusEffect } from "@react-navigation/native";

import { selectContactList, selectUserAddress } from "../selectors";
import {
  LoadContactList,
  ContactAdd as ContactAddAction,
  ContactDel as ContactDelAction,
  ContactToggleIsFollow,
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
function ContactCard({ contact, onChat, onToggleFollow, onDelete }) {
  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={() => onChat(contact)}
      className="bg-surface-card rounded-xl p-4 flex-row items-center gap-3 border border-secondary-light"
    >
      {/* Avatar placeholder */}
      <View className="w-10 h-10 rounded-full bg-primary/20 items-center justify-center">
        <Ionicons name="person" size={20} color="#e6b420" />
      </View>

      <View className="flex-1 min-w-0">
        <Text className="text-base font-medium text-text-primary truncate">
          {contact.nickname || "Unknown"}
        </Text>
        <Text className="text-xs font-mono text-text-secondary/70 truncate">
          {contact.address}
        </Text>
      </View>

      {/* Follow badge / toggle */}
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={() => onToggleFollow(contact)}
        className={`px-2 py-1 rounded-full ${
          contact.is_follow ? "bg-status-success/20" : "bg-secondary-light/20"
        }`}
      >
        <Text
          className={`text-xs ${
            contact.is_follow ? "text-status-success" : "text-text-secondary"
          }`}
        >
          {contact.is_follow ? "Following" : "Follow"}
        </Text>
      </TouchableOpacity>

      {/* Delete button */}
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={() => onDelete(contact)}
        className="p-1"
      >
        <Ionicons name="close-circle" size={20} color="#ef4444" />
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

// ---------------------------------------------------------------------------
// Add Contact Modal
// ---------------------------------------------------------------------------
function AddContactModal({ visible, onClose, onAdd }) {
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
            Add Contact
          </Text>

          <View className="gap-1">
            <Text className="text-sm text-text-secondary">XRPL Address</Text>
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
              Nickname (optional)
            </Text>
            <TextInput
              value={nickname}
              onChangeText={setNickname}
              placeholder="Display name"
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
                Cancel
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
                Add
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
  const dispatch = useDispatch();
  const contacts = useSelector(selectContactList);
  const selfAddress = useSelector(selectUserAddress);
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

  const handleTap = useCallback(
    (contact) => {
      navigation.navigate("AddressBulletins", {
        address: contact.address,
      });
    },
    [navigation],
  );

  const handleToggleFollow = useCallback(
    (contact) => {
      dispatch(ContactToggleIsFollow({ contact_address: contact.address }));
    },
    [dispatch],
  );

  const handleDelete = useCallback(
    (contact) => {
      Alert.alert(
        "Delete Contact",
        `Remove ${contact.nickname || contact.address} from contacts?`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete",
            style: "destructive",
            onPress: () =>
              dispatch(ContactDelAction({ contact_address: contact.address })),
          },
        ],
      );
    },
    [dispatch],
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
        onChat={handleTap}
        onToggleFollow={handleToggleFollow}
        onDelete={handleDelete}
      />
    ),
    [handleTap, handleToggleFollow, handleDelete],
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
              Contacts
            </Text>
            <Text className="text-xs text-text-secondary/70 mt-0.5">
              {contacts.length} total · {followCount} following
            </Text>
          </View>

          {/* Add Contact button */}
          <TouchableOpacity
            onPress={() => setShowAddModal(true)}
            activeOpacity={0.7}
            className="flex-row items-center gap-1.5 bg-primary/10 border border-primary/30 px-3 py-2 rounded-lg"
          >
            <Ionicons name="add" size={16} color="#e6b420" />
            <Text className="text-xs font-medium text-primary">Add</Text>
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
            tintColor="#e6b420"
          />
        }
        ListEmptyComponent={
          <View className="flex-1 items-center justify-center py-20 px-8">
            <Ionicons name="people-outline" size={56} color="#d4c8a8" />
            <Text className="text-xl font-bold text-text-primary mt-4 mb-2">
              No contacts yet
            </Text>
            <Text className="text-sm text-text-secondary text-center">
              Tap the Add button above to add an XRPL address.
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
