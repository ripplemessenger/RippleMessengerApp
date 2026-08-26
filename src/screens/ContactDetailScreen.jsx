import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  TextInput,
  Alert,
  ScrollView,
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
  ContactDel as ContactDelAction,
  ContactToggleIsFollow,
  ContactToggleIsFriend,
} from "../store/sagas/messenger.actions";

/**
 * ContactDetailScreen — detail page for a single contact.
 *
 * Features:
 * - Large avatar + nickname + address
 * - Follow/Unfollow toggle
 * - Friend/Unfriend toggle
 * - Edit nickname (modal)
 * - Copy address
 * - Start private chat (friend only)
 * - View bulletins
 * - Delete contact
 */
export default function ContactDetailScreen({ navigation, route }) {
  const { address } = route.params;
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const contacts = useSelector(selectContactList);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editNickname, setEditNickname] = useState("");

  const contact = contacts.find((c) => c.address === address);

  // Load contact list on focus to get fresh data
  useFocusEffect(
    useCallback(() => {
      dispatch(LoadContactList());
    }, [dispatch]),
  );

  const handleToggleFollow = useCallback(() => {
    dispatch(ContactToggleIsFollow({ contact_address: address }));
  }, [dispatch, address]);

  const handleToggleFriend = useCallback(() => {
    dispatch(ContactToggleIsFriend({ contact_address: address }));
  }, [dispatch, address]);

  const handleEditNickname = useCallback(() => {
    setEditNickname(contact?.nickname || "");
    setShowEditModal(true);
  }, [contact]);

  const handleSaveNickname = useCallback(() => {
    const trimmed = editNickname.trim();
    dispatch(ContactAddAction({ address, nickname: trimmed }));
    setShowEditModal(false);
  }, [dispatch, address, editNickname]);

  const handleCopyAddress = useCallback(() => {
    // Copy to clipboard (RN Clipboard API)
    import("react-native").then(({ Clipboard }) => {
      Clipboard.setString(address);
      Alert.alert(t("common.copied"), address);
    });
  }, [address, t]);

  const handleStartChat = useCallback(() => {
    // Navigate to ChatDetail with this contact
    navigation.getParent().navigate("ChatDetail", {
      session: {
        address,
        nickname: contact?.nickname || address,
        is_friend: true,
      },
    });
  }, [navigation, address, contact]);

  const handleViewBulletins = useCallback(() => {
    navigation.getParent().navigate("AddressBulletins", { address });
  }, [navigation, address]);

  const handleDelete = useCallback(() => {
    Alert.alert(
      t("contact.delete_title"),
      t("contact.delete_confirm", {
        name: contact?.nickname || address,
      }),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("common.delete"),
          style: "destructive",
          onPress: () => {
            dispatch(ContactDelAction({ contact_address: address }));
            navigation.goBack();
          },
        },
      ],
    );
  }, [dispatch, address, contact, navigation, t]);

  if (!contact) {
    return (
      <View className="flex-1 items-center justify-center bg-surface">
        <Text className="text-base text-text-secondary">
          {t("common.not_found")}
        </Text>
      </View>
    );
  }

  return (
    <ScrollView className="flex-1 bg-surface">
      {/* Header: avatar + name + address */}
      <View className="items-center py-8 px-6">
        <AvatarImage address={address} nickname={contact.nickname} size={80} />
        <Text className="text-xl font-semibold text-text-primary mt-4">
          {contact.nickname || t("common.unknown")}
        </Text>
        <Text className="text-sm font-mono text-text-secondary/70 mt-1">
          {address}
        </Text>
      </View>

      {/* Action buttons */}
      <View className="px-6 gap-3">
        {/* Edit nickname */}
        <TouchableOpacity
          onPress={handleEditNickname}
          activeOpacity={0.7}
          className="flex-row items-center justify-center py-3 rounded-xl bg-secondary-light/20 border border-secondary-light/30"
        >
          <Ionicons name="create-outline" size={18} color="#a89f85" />
          <Text className="text-base font-medium ml-2 text-text-primary">
            {t("setting.edit_nickname")}
          </Text>
        </TouchableOpacity>

        {/* Follow/Unfollow */}
        <TouchableOpacity
          onPress={handleToggleFollow}
          activeOpacity={0.7}
          className={`flex-row items-center justify-center py-3 rounded-xl border ${
            contact.is_follow
              ? "bg-status-error/10 border-status-error/30"
              : "bg-status-success/10 border-status-success/30"
          }`}
        >
          <Ionicons
            name={
              contact.is_follow ? "person-remove-outline" : "person-add-outline"
            }
            size={18}
            color={contact.is_follow ? "#f44336" : "#4caf50"}
          />
          <Text
            className={`text-base font-medium ml-2 ${
              contact.is_follow ? "text-status-error" : "text-status-success"
            }`}
          >
            {contact.is_follow ? t("common.unfollow") : t("common.follow")}
          </Text>
        </TouchableOpacity>

        {/* Friend/Unfriend */}
        <TouchableOpacity
          onPress={handleToggleFriend}
          activeOpacity={0.7}
          className={`flex-row items-center justify-center py-3 rounded-xl border ${
            contact.is_friend
              ? "bg-status-error/10 border-status-error/30"
              : "bg-status-success/10 border-status-success/30"
          }`}
        >
          <Ionicons
            name={
              contact.is_friend ? "close-circle-outline" : "chatbubbles-outline"
            }
            size={18}
            color={contact.is_friend ? "#f44336" : "#4caf50"}
          />
          <Text
            className={`text-base font-medium ml-2 ${
              contact.is_friend ? "text-status-error" : "text-status-success"
            }`}
          >
            {contact.is_friend
              ? t("common.remove_friend")
              : t("common.add_friend")}
          </Text>
        </TouchableOpacity>

        {/* Copy address */}
        <TouchableOpacity
          onPress={handleCopyAddress}
          activeOpacity={0.7}
          className="flex-row items-center justify-center py-3 rounded-xl bg-secondary-light/20 border border-secondary-light/30"
        >
          <Ionicons name="copy-outline" size={18} color="#a89f85" />
          <Text className="text-base font-medium ml-2 text-text-primary">
            {t("setting.copy_address")}
          </Text>
        </TouchableOpacity>

        {/* Start chat (friend only) */}
        {contact.is_friend && (
          <TouchableOpacity
            onPress={handleStartChat}
            activeOpacity={0.7}
            className="flex-row items-center justify-center py-3 rounded-xl bg-primary/10 border border-primary/30"
          >
            <Ionicons name="chatbubbles-outline" size={18} color={ACCENT} />
            <Text className="text-base font-medium ml-2 text-primary">
              {t("common.start_chat")}
            </Text>
          </TouchableOpacity>
        )}

        {/* View bulletins */}
        <TouchableOpacity
          onPress={handleViewBulletins}
          activeOpacity={0.7}
          className="flex-row items-center justify-center py-3 rounded-xl bg-secondary-light/20 border border-secondary-light/30"
        >
          <Ionicons name="volume-high-outline" size={18} color="#a89f85" />
          <Text className="text-base font-medium ml-2 text-text-primary">
            {t("ui.view_bulletins")}
          </Text>
        </TouchableOpacity>

        {/* Delete contact */}
        {contact.is_follow === false && contact.is_friend === false && (
          <TouchableOpacity
            onPress={handleDelete}
            activeOpacity={0.7}
            className="flex-row items-center justify-center py-3 rounded-xl bg-status-error/10 border border-status-error/30"
          >
            <Ionicons name="trash-outline" size={18} color="#f44336" />
            <Text className="text-base font-medium ml-2 text-status-error">
              {t("common.delete")}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Edit nickname modal */}
      <Modal
        visible={showEditModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowEditModal(false)}
      >
        <View className="flex-1 justify-center items-center bg-black/50 px-6">
          <View className="bg-surface-card rounded-2xl p-6 w-full gap-4 border border-secondary-light">
            <Text className="text-xl font-semibold text-text-primary text-center">
              {t("setting.edit_nickname")}
            </Text>
            <TextInput
              value={editNickname}
              onChangeText={setEditNickname}
              placeholder={t("ui.nickname")}
              placeholderTextColor="#9a9590"
              autoFocus
              className="bg-surface border border-secondary-light rounded-xl px-4 py-3 text-text-primary text-sm"
            />
            <View className="flex-row gap-3 mt-2">
              <TouchableOpacity
                onPress={() => setShowEditModal(false)}
                activeOpacity={0.7}
                className="flex-1 py-3 rounded-xl border border-secondary-light items-center"
              >
                <Text className="text-base font-medium text-text-secondary">
                  {t("common.cancel")}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleSaveNickname}
                activeOpacity={0.7}
                className="flex-1 py-3 rounded-xl bg-primary items-center"
              >
                <Text className="text-base font-semibold text-text-primary">
                  {t("common.save")}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}
