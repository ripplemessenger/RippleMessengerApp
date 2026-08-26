import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  FlatList,
  RefreshControl,
  ActivityIndicator,
} from "react-native";
import Ionicons from "react-native-vector-icons/Ionicons";
import { useDispatch, useSelector } from "react-redux";
import { useTranslation } from "react-i18next";

import BulletinCard from "../components/Bulletin/BulletinCard";
import { selectRandomBulletins, selectMessengerConnStatus } from "../selectors";
import { RequestRandomBulletin } from "../store/sagas/messenger.actions";
import { ACCENT } from "../lib/theme";

/**
 * RandomBulletinsScreen — displays random bulletins fetched from the network.
 * Unlike paginated screens, random bulletins return a flat list without page numbers.
 */
export default function RandomBulletinsScreen({ navigation }) {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const bulletins = useSelector(selectRandomBulletins);
  const isConnected = useSelector(selectMessengerConnStatus);

  const refreshingRef = useRef(false);

  // Load random bulletins when component mounts and connected
  useEffect(() => {
    if (isConnected) {
      dispatch(RequestRandomBulletin());
    }
  }, [dispatch, isConnected]);

  // Set header with back button
  React.useLayoutEffect(() => {
    navigation.setOptions({
      headerLeft: () => (
        <Text
          onPress={() => navigation.goBack()}
          className="text-base font-semibold text-primary"
          style={{ paddingLeft: 8 }}
        >
          ← {t("common.back")}
        </Text>
      ),
      title: t("ui.random_posts"),
      headerStyle: { backgroundColor: ACCENT },
      headerTintColor: "#1a1a2e",
    });
  }, [navigation]);

  const handleRefresh = useCallback(() => {
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    dispatch(RequestRandomBulletin());
    setTimeout(() => {
      refreshingRef.current = false;
    }, 3000);
  }, [dispatch]);

  const handlePressBulletin = useCallback(
    (bulletin) => {
      // This screen is a direct child of RootStack, so navigate() directly.
      navigation.navigate("MainTabs", {
        screen: "Bulletin",
        params: {
          screen: "BulletinDetail",
          params: {
            hash: bulletin.hash,
            address: bulletin.address,
            sequence: bulletin.sequence,
          },
        },
      });
    },
    [navigation],
  );

  const handleTagPress = useCallback(
    (t) => {
      navigation.navigate("TagBulletins", { tag: t });
    },
    [navigation],
  );

  const renderItem = useCallback(
    ({ item }) => (
      <BulletinCard
        bulletin={item}
        onPress={() => handlePressBulletin(item)}
        onTagPress={handleTagPress}
      />
    ),
    [handlePressBulletin, handleTagPress],
  );

  const keyExtractor = useCallback((item) => item.hash, []);

  return (
    <View className="flex-1 bg-surface">
      {/* Header info */}
      <View className="px-4 py-3 bg-primary/5 border-b border-secondary-light/30">
        <View className="flex-row items-center gap-2">
          <Ionicons name="shuffle" size={20} color={ACCENT} />
          <Text className="text-lg font-bold text-text-primary">
            {t("ui.random_posts")}
          </Text>
        </View>
        <View className="flex-row items-center gap-2 mt-1">
          <Text className="text-xs text-text-secondary/70">
            {t("ui.random_count", { count: bulletins.length })}
          </Text>
        </View>
      </View>

      <FlatList
        data={bulletins}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        contentContainerStyle={{ padding: 16, flexGrow: 1 }}
        className="bg-surface"
        refreshControl={
          <RefreshControl
            refreshing={refreshingRef.current}
            onRefresh={handleRefresh}
            tintColor={ACCENT}
          />
        }
        ListEmptyComponent={
          <View className="flex-1 items-center justify-center py-20">
            <Ionicons name="shuffle-outline" size={48} color="#d4c8a8" />
            <Text className="text-xl font-bold text-text-primary mt-3 mb-1">
              {t("ui.no_random")}
            </Text>
            <Text className="text-sm text-text-secondary text-center px-8">
              {isConnected
                ? t("ui.random_hint")
                : t("ui.random_hint_disconnected")}
            </Text>
          </View>
        }
      />
    </View>
  );
}
