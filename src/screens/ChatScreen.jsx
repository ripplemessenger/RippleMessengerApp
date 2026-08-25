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
  Modal,
  Alert,
} from "react-native";
import Ionicons from "react-native-vector-icons/Ionicons";
import { useDispatch, useSelector } from "react-redux";
import { useFocusEffect } from "@react-navigation/native";

import SessionListItem from "../components/Chat/SessionListItem";
import {
  selectChatSessions,
  selectUserAddress,
  selectContactMap,
  selectMessengerConnStatus,
} from "../selectors";
import {
  LoadSessionList,
  ContactAdd as ContactAddAction,
} from "../store/sagas/messenger.actions";
import { SessionType } from "../lib/AppConst";
import { ACCENT } from "../lib/theme";

/**
 * ChatScreen — session list screen for the Chat tab.
 *
 * Features:
 * - Tab filter for private / all / group sessions
 * - Search input to filter by name
 * - Pull-to-refresh to reload session list
 * - Empty state when no sessions exist
 */
export default function ChatScreen({ navigation }) {
  const dispatch = useDispatch();
  const sessions = useSelector(selectChatSessions);
  const selfAddress = useSelector(selectUserAddress);
  const contactMap = useSelector(selectContactMap);
  const isConnected = useSelector(selectMessengerConnStatus);

  // Active tab: 'all' | 'private' | 'group'
  const [activeTab, setActiveTab] = useState("all");
  // Search filter text
  const [searchText, setSearchText] = useState("");
  // Add Friend modal state
  const [showAddFriendModal, setShowAddFriendModal] = useState(false);
  const [friendAddress, setFriendAddress] = useState("");
  const [friendNickname, setFriendNickname] = useState("");
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

  const handleAddFriend = useCallback(() => {
    const trimmedAddress = friendAddress.trim();
    if (!trimmedAddress) {
      Alert.alert("Error", "Please enter an XRPL address.");
      return;
    }
    dispatch(
      ContactAddAction({
        address: trimmedAddress,
        nickname: friendNickname.trim() || "",
      }),
    );
    setFriendAddress("");
    setFriendNickname("");
    setShowAddFriendModal(false);
  }, [dispatch, friendAddress, friendNickname]);

  // Filter sessions by tab and search text
  const filteredSessions = useMemo(() => {
    return sessions.filter((session) => {
      // Tab filter
      if (activeTab === "private" && session.type !== SessionType.Private)
        return false;
      if (activeTab === "group" && session.type !== SessionType.Group)
        return false;

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
  }, [sessions, activeTab, searchText, contactMap]);

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

  // Connection status text
  const statusText = isConnected ? "Connected" : "Disconnected";
  const statusColor = isConnected ? "bg-status-success" : "bg-status-error";

  return (
    <View className="flex-1 bg-surface">
      {/* Header bar */}
      <View className="px-4 py-3 bg-primary/5 border-b border-secondary-light/30">
        <View className="flex-row items-center justify-between">
          <Text className="text-xl font-bold text-text-primary">Chats</Text>
          <View className="flex-row items-center gap-2">
            <View className={`w-2 h-2 rounded-full ${statusColor}`} />
            <Text className="text-xs text-text-secondary/70">{statusText}</Text>
          </View>
        </View>

        {/* Tab filters */}
        <View className="flex-row mt-2 gap-2">
          {["all", "private", "group"].map((tab) => (
            <TouchableOpacity
              key={tab}
              onPress={() => setActiveTab(tab)}
              activeOpacity={0.7}
              className={`px-3 py-1 rounded-full border ${
                activeTab === tab
                  ? "bg-primary/20 border-primary text-text-primary"
                  : "bg-transparent border-secondary-light/40 text-text-secondary"
              }`}
            >
              <Text
                className={`text-xs font-medium ${
                  activeTab === tab
                    ? "text-text-primary"
                    : "text-text-secondary"
                }`}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}

          {/* Add friend */}
          <View className="flex-1" />
          <TouchableOpacity
            onPress={() => setShowAddFriendModal(true)}
            activeOpacity={0.7}
            className="px-3 py-1 rounded-full border border-primary/40 bg-primary/10"
          >
            <Text className="text-xs text-text-primary font-medium">
              + Add Friend
            </Text>
          </TouchableOpacity>
        </View>

        {/* Search input */}
        <View className="flex-row items-center mt-2 bg-surface-alt rounded-lg px-3 py-1.5 border border-secondary-light/30">
          <Ionicons name="search" size={16} color="#a89f85" />
          <TextInput
            placeholder="Search conversations..."
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
              No conversations yet
            </Text>
            <Text className="text-sm text-text-secondary text-center">
              {isConnected
                ? "When you exchange messages with contacts, they will appear here."
                : "Connect to a server first to start chatting."}
            </Text>
          </View>
        }
      />

      {/* Add Friend Modal */}
      <Modal
        visible={showAddFriendModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowAddFriendModal(false)}
      >
        <View className="flex-1 justify-center items-center bg-black/50 px-6">
          <View className="bg-surface-card rounded-2xl p-6 w-full gap-4 border border-secondary-light">
            <Text className="text-xl font-semibold text-text-primary text-center">
              Add Friend
            </Text>

            <View className="gap-1">
              <Text className="text-sm text-text-secondary">XRPL Address</Text>
              <TextInput
                value={friendAddress}
                onChangeText={setFriendAddress}
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
                value={friendNickname}
                onChangeText={setFriendNickname}
                placeholder="Display name"
                placeholderTextColor="#9a9590"
                className="bg-surface border border-secondary-light rounded-xl px-4 py-3 text-text-primary text-sm"
              />
            </View>

            <View className="flex-row gap-3 mt-2">
              <TouchableOpacity
                onPress={() => setShowAddFriendModal(false)}
                className="flex-1 py-3 rounded-xl border border-secondary-light items-center"
              >
                <Text className="text-base font-medium text-text-secondary">
                  Cancel
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleAddFriend}
                className="flex-1 bg-primary py-3 rounded-xl items-center"
              >
                <Text className="text-base font-semibold text-text-primary">
                  Add
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
