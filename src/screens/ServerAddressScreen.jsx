import React, { useCallback, useRef } from "react";
import {
  View,
  Text,
  FlatList,
  RefreshControl,
  TouchableOpacity,
} from "react-native";
import Ionicons from "react-native-vector-icons/Ionicons";
import { useDispatch, useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import { useFocusEffect } from "@react-navigation/native";

import { RequestServerAddress } from "../store/sagas/messenger.actions";
import { ACCENT } from "../lib/theme";

/**
 * ServerAddressScreen — shows the addresses (accounts) discovered on a server,
 * with their bulletin counts. Mirrors Client's ServerAddressPage.
 *
 * Route params: { url: string }
 * Data: Messenger.ServerAddressPage / ServerAddressTotalPage / ServerAddressList
 * (filled by the WebSocket handler for ObjectType.ServerAddressList)
 */
export default function ServerAddressScreen({ route, navigation }) {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const url = route.params?.url || "";
  const { ServerAddressPage, ServerAddressTotalPage, ServerAddressList } =
    useSelector((state) => ({
      ServerAddressPage: state.Messenger.ServerAddressPage,
      ServerAddressTotalPage: state.Messenger.ServerAddressTotalPage,
      ServerAddressList: state.Messenger.ServerAddressList,
    }));

  const refreshingRef = useRef(false);

  const loadPage = useCallback(
    (page) => {
      dispatch(RequestServerAddress({ url, page }));
    },
    [dispatch, url],
  );

  // Request page 1 on focus (and when returning from a sub-screen)
  useFocusEffect(
    useCallback(() => {
      loadPage(1);
    }, [loadPage]),
  );

  const handleRefresh = useCallback(() => {
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    loadPage(1);
    setTimeout(() => {
      refreshingRef.current = false;
    }, 3000);
  }, [loadPage]);

  const handleAddressPress = useCallback(
    (address) => {
      navigation.navigate("AddressBulletins", { address });
    },
    [navigation],
  );

  const renderItem = useCallback(
    ({ item }) => (
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={() => handleAddressPress(item.Address)}
        className="flex-row items-center gap-3 py-3 border-b border-secondary-light/30"
      >
        <View className="w-10 h-10 rounded-full bg-primary/20 items-center justify-center">
          <Ionicons name="person" size={18} color={ACCENT} />
        </View>
        <View className="flex-1 min-w-0">
          <Text className="text-sm font-mono text-text-primary truncate">
            {item.Address}
          </Text>
        </View>
        <View className="px-3 py-1 rounded-full bg-secondary-light/20">
          <Text className="text-xs text-text-secondary">
            {t("ui.address_posts_count", { count: item.Count ?? 0 })}
          </Text>
        </View>
      </TouchableOpacity>
    ),
    [handleAddressPress],
  );

  const keyExtractor = useCallback((item) => item.Address, []);

  return (
    <View className="flex-1 bg-surface">
      {/* Header */}
      <View className="px-4 py-3 bg-primary/5 border-b border-secondary-light/30">
        <Text className="text-lg font-bold text-text-primary">
          {t("ui.server_stats")}
        </Text>
        <Text className="text-xs font-mono text-text-secondary/70 mt-0.5 truncate">
          {url}
        </Text>
      </View>

      {/* Address list */}
      <FlatList
        data={ServerAddressList}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        contentContainerStyle={{ paddingHorizontal: 16, flexGrow: 1 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshingRef.current}
            onRefresh={handleRefresh}
            tintColor={ACCENT}
          />
        }
        ListEmptyComponent={
          <View className="flex-1 items-center justify-center py-20 px-8">
            <Ionicons name="globe-outline" size={56} color="#d4c8a8" />
            <Text className="text-xl font-bold text-text-primary mt-4 mb-2">
              {t("ui.no_addresses")}
            </Text>
            <Text className="text-sm text-text-secondary text-center">
              {t("ui.server_no_addresses")}
            </Text>
          </View>
        }
      />

      {/* Pagination */}
      {ServerAddressTotalPage > 1 && (
        <View className="flex-row items-center justify-center gap-4 py-3 border-t border-secondary-light/30">
          <TouchableOpacity
            disabled={ServerAddressPage <= 1}
            activeOpacity={0.7}
            onPress={() => loadPage(ServerAddressPage - 1)}
            className={`px-4 py-2 rounded-lg ${
              ServerAddressPage <= 1
                ? "bg-secondary-light/20"
                : "bg-primary/10 border border-primary/30"
            }`}
          >
            <Text
              className={`text-sm ${
                ServerAddressPage <= 1
                  ? "text-text-secondary/50"
                  : "text-primary"
              }`}
            >
              {t("common.prev")}
            </Text>
          </TouchableOpacity>
          <Text className="text-sm text-text-secondary">
            {ServerAddressPage} / {ServerAddressTotalPage}
          </Text>
          <TouchableOpacity
            disabled={ServerAddressPage >= ServerAddressTotalPage}
            activeOpacity={0.7}
            onPress={() => loadPage(ServerAddressPage + 1)}
            className={`px-4 py-2 rounded-lg ${
              ServerAddressPage >= ServerAddressTotalPage
                ? "bg-secondary-light/20"
                : "bg-primary/10 border border-primary/30"
            }`}
          >
            <Text
              className={`text-sm ${
                ServerAddressPage >= ServerAddressTotalPage
                  ? "text-text-secondary/50"
                  : "text-primary"
              }`}
            >
              {t("common.next")}
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}
