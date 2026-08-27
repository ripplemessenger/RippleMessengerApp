import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { View, Text, FlatList, RefreshControl } from "react-native";
import Ionicons from "react-native-vector-icons/Ionicons";
import { useDispatch, useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import { useFocusEffect } from "@react-navigation/native";

import SessionListItem from "../components/Chat/SessionListItem";
import SearchBar from "../components/common/SearchBar";
import EmptyState from "../components/common/EmptyState";
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
  const [refreshing, setRefreshing] = useState(false);

  // Load session list on focus
  useFocusEffect(
    useCallback(() => {
      dispatch(LoadSessionList());
    }, [dispatch]),
  );

  const handleRefresh = useCallback(() => {
    if (refreshing) return;
    setRefreshing(true);
    dispatch(LoadSessionList());
    setTimeout(() => {
      setRefreshing(false);
    }, 3000);
  }, [dispatch, refreshing]);

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
        <View className="mt-2">
          <SearchBar
            value={searchText}
            onChange={setSearchText}
            placeholder={t("ui.search_conversations")}
          />
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
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={ACCENT}
          />
        }
        ListEmptyComponent={
          <EmptyState
            icon="chatbubbles-outline"
            title={t("ui.no_conversations")}
            hint={
              isConnected
                ? t("chat.sessions_empty")
                : t("chat.sessions_empty_disconnected")
            }
          />
        }
      />
    </View>
  );
}
