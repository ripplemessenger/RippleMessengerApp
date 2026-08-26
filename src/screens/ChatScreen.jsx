import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  View,
  Text,
  FlatList,
  RefreshControl,
  TextInput,
  TouchableOpacity,
} from "react-native";
import Ionicons from "react-native-vector-icons/Ionicons";
import { useDispatch, useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import { useFocusEffect } from "@react-navigation/native";

import SessionListItem from "../components/Chat/SessionListItem";
import {
  selectChatSessions,
  selectUserAddress,
  selectContactMap,
  selectMessengerConnStatus,
} from "../selectors";
import { LoadSessionList } from "../store/sagas/messenger.actions";
import { SessionType } from "../lib/AppConst";
import { ACCENT } from "../lib/theme";

/**
 * ChatScreen — session list screen for the Chat tab.
 *
 * Features:
 * - Search input to filter by name
 * - Pull-to-refresh to reload session list
 * - Empty state when no sessions exist
 */
export default function ChatScreen({ navigation }) {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const sessions = useSelector(selectChatSessions);
  const selfAddress = useSelector(selectUserAddress);
  const contactMap = useSelector(selectContactMap);
  const isConnected = useSelector(selectMessengerConnStatus);

  // Search filter text
  const [searchText, setSearchText] = useState("");
  const refreshingRef = useRef(false);

  // Load session list on focus
  useFocusEffect(
    useCallback(() => {
      dispatch(LoadSessionList());
    }, [dispatch]),
  );

  const handleRefresh = useCallback(() => {
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    dispatch(LoadSessionList());
    setTimeout(() => {
      refreshingRef.current = false;
    }, 3000);
  }, [dispatch]);

  // Filter sessions by search text
  const filteredSessions = useMemo(() => {
    return sessions.filter((session) => {
      // Search filter
      if (searchText.trim().length > 0) {
        const searchLower = searchText.toLowerCase();
        if (session.type === SessionType.Private) {
          const name = (contactMap[session.address] || "").toLowerCase();
          const addr = (session.address || "").toLowerCase();
          return name.includes(searchLower) || addr.includes(searchLower);
        } else {
          const name = (session.name || "").toLowerCase();
          return name.includes(searchLower);
        }
      }

      return true;
    });
  }, [sessions, searchText, contactMap]);

  const handleSessionPress = useCallback(
    (session) => {
      navigation.navigate("ChatDetail", { session });
    },
    [navigation],
  );

  const renderItem = useCallback(
    ({ item }) => (
      <SessionListItem
        session={item}
        onPress={() => handleSessionPress(item)}
        contactMap={contactMap}
        selfAddress={selfAddress}
      />
    ),
    [handleSessionPress, contactMap, selfAddress],
  );

  const keyExtractor = useCallback((item) => {
    if (item.type === SessionType.Private) {
      return `private-${item.address}`;
    }
    return `group-${item.hash}`;
  }, []);

  return (
    <View className="flex-1 bg-surface">
      {/* Header bar */}
      <View className="px-4 py-3 bg-primary/5 border-b border-secondary-light/30">
        <View className="flex-row items-center justify-between">
          <Text className="text-xl font-bold text-text-primary">
            {t("common.chat")}
          </Text>
        </View>

        {/* Search input */}
        <View className="flex-row items-center mt-2 bg-surface-alt rounded-lg px-3 py-1.5 border border-secondary-light/30">
          <Ionicons name="search" size={16} color="#a89f85" />
          <TextInput
            placeholder={t("ui.search_conversations")}
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
      </View>

      {/* Session list */}
      <FlatList
        data={filteredSessions}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        contentContainerStyle={{ flexGrow: 1 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshingRef.current}
            onRefresh={handleRefresh}
            tintColor={ACCENT}
          />
        }
        ListEmptyComponent={
          <View className="flex-1 items-center justify-center py-20 px-8">
            <Ionicons name="chatbubbles-outline" size={56} color="#d4c8a8" />
            <Text className="text-xl font-bold text-text-primary mt-4 mb-2">
              {t("ui.no_conversations")}
            </Text>
            <Text className="text-sm text-text-secondary text-center">
              {isConnected
                ? t("chat.sessions_empty")
                : t("chat.sessions_empty_disconnected")}
            </Text>
          </View>
        }
      />
    </View>
  );
}
