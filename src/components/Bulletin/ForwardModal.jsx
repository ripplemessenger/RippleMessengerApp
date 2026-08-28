import React, { useState, useCallback, useEffect, useMemo } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
} from "react-native";
import Ionicons from "react-native-vector-icons/Ionicons";
import { useDispatch, useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import BottomSheet from "../common/BottomSheet";

import { ForwardBulletin } from "../../store/sagas/messenger.actions";
import { setForwardFlag } from "../../store/slices/MessengerSlice";
import { selectContactMap } from "../../selectors";
import AvatarImage from "../AvatarImage";
import { dbAPI } from "../../db";
import { ACCENT } from "../../lib/theme";
import { shortenAddress } from "../../lib/format";

let _forwardKeyCounter = 0;

/**
 * ForwardModal — bottom-sheet modal for selecting a contact to forward a bulletin.
 *
 * Flow:
 *   1. BulletinCard / BulletinDetailScreen dispatches ShowForwardBulletin(bulletin)
 *   2. Saga sets Messenger.ForwardBulletin = bulletin, Messenger.ShowForwardFlag = true
 *   3. This modal reads the flag via useSelector, opens on visible
 *   4. User picks a contact from friends list
 *   5. Modal dispatches ForwardBulletin({ session: { address: contact.remote } })
 */

export default function ForwardModal({ visible }) {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const contactMap = useSelector(selectContactMap);
  const selfAddress = useSelector((state) => state.User.Address);

  const [friends, setFriends] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState("");

  // Load friend list — defined before useEffect so it can be a dependency
  const loadFriends = useCallback(async () => {
    if (!selfAddress) return;
    setLoading(true);
    try {
      const list = await dbAPI.getMyFriends(selfAddress);
      setFriends(list || []);
    } catch (e) {
      console.error("[ForwardModal] failed to load friends:", e.message);
    } finally {
      setLoading(false);
    }
  }, [selfAddress]);

  // Reset search and reload friends when modal opens or selfAddress changes
  useEffect(() => {
    if (visible) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- resetting state on modal open
      setSearchText("");
      loadFriends();
    }
  }, [visible, selfAddress, loadFriends]);

  const handleClose = useCallback(() => {
    dispatch(setForwardFlag(false));
  }, [dispatch]);

  const handleForward = useCallback(
    (contact) => {
      // The saga will set setForwardFlag(false) closing the modal after send
      dispatch(ForwardBulletin({ session: { address: contact.remote } }));
    },
    [dispatch],
  );

  // Filter friends by search text
  const filteredFriends = useMemo(() => {
    return friends.filter((f) => {
      if (!searchText.trim()) return true;
      const searchLower = searchText.toLowerCase();
      const nickname = (contactMap?.[f.remote] || "").toLowerCase();
      const address = (f.remote || "").toLowerCase();
      return nickname.includes(searchLower) || address.includes(searchLower);
    });
  }, [friends, searchText, contactMap]);

  const renderFriend = useCallback(
    ({ item: friend }) => {
      const nickname =
        contactMap?.[friend.remote] || shortenAddress(friend.remote);

      return (
        <TouchableOpacity
          onPress={() => handleForward(friend)}
          activeOpacity={0.6}
          className="flex-row items-center gap-3 py-3 px-2 rounded-lg"
        >
          <AvatarImage address={friend.remote} nickname={nickname} size={40} />
          <View className="flex-1 min-w-0">
            <Text className="text-base font-semibold text-text-primary truncate">
              {nickname}
            </Text>
            <Text className="text-xs text-text-secondary/70" numberOfLines={1}>
              {shortenAddress(friend.remote)}
            </Text>
          </View>
          <Ionicons name="arrow-forward" size={20} color={ACCENT} />
        </TouchableOpacity>
      );
    },
    [contactMap, handleForward],
  );

  return (
    <BottomSheet
      visible={visible}
      onClose={handleClose}
      title={t("ui.forward_bulletin")}
    >
      {/* Search input */}
      <View className="flex-row items-center bg-surface rounded-lg px-3 py-2 border border-secondary-light/30">
        <Ionicons name="search" size={16} color="#a89f85" />
        <TextInput
          placeholder={t("ui.search_contacts")}
          placeholderTextColor="#a89f85"
          value={searchText}
          onChangeText={setSearchText}
          className="flex-1 ml-2 text-sm text-text-primary py-0.5"
        />
        {searchText.length > 0 && (
          <TouchableOpacity
            onPress={() => setSearchText("")}
            activeOpacity={0.6}
          >
            <Ionicons name="close-circle" size={18} color="#a89f85" />
          </TouchableOpacity>
        )}
      </View>

      {/* Friends list */}
      <View>
        {loading ? (
          <View className="items-center py-16">
            <ActivityIndicator size="large" color={ACCENT} />
            <Text className="text-sm text-text-secondary mt-3">
              {t("ui.loading_contacts")}
            </Text>
          </View>
        ) : filteredFriends.length > 0 ? (
          <FlatList
            data={filteredFriends}
            renderItem={renderFriend}
            keyExtractor={(item) =>
              item.remote || `friend-${++_forwardKeyCounter}`
            }
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 10 }}
          />
        ) : (
          <View className="items-center py-16">
            <Ionicons name="people-outline" size={48} color="#d4c8a8" />
            <Text className="text-base text-text-primary mt-3 font-semibold">
              {searchText.trim()
                ? t("ui.no_contacts_available")
                : t("ui.no_contacts")}
            </Text>
            <Text className="text-xs text-text-secondary/60 mt-1 px-8 text-center">
              {searchText.trim()
                ? t("ui.try_different_search")
                : t("ui.add_friends_first")}
            </Text>
          </View>
        )}
      </View>
    </BottomSheet>
  );
}
