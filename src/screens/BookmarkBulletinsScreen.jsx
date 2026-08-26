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
import { selectBookmarkBulletins } from "../selectors";
import { LoadBookmarkBulletin } from "../store/sagas/messenger.actions";
import { ACCENT } from "../lib/theme";

/**
 * BookmarkBulletins — displays all bookmarked (marked) bulletins.
 */
export default function BookmarkBulletins({ navigation }) {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const {
    list: bulletins,
    page,
    totalPage,
  } = useSelector(selectBookmarkBulletins);

  // Locally accumulated bulletin list across pages
  const [allBulletins, setAllBulletins] = useState([]);
  const [localPage, setLocalPage] = useState(0);
  const refreshingRef = useRef(false);

  // Load initial page when component mounts
  useEffect(() => {
    dispatch(LoadBookmarkBulletin({ page: 1 }));
  }, [dispatch]);

  // Sync Redux data into local state whenever Redux updates
  useEffect(() => {
    if (page === 1 && bulletins.length >= 0) {
      setAllBulletins(bulletins);
      setLocalPage(1);
    } else if (page > 1 && bulletins.length > 0) {
      setAllBulletins((prev) => [...prev, ...bulletins]);
      setLocalPage(page);
    }
  }, [bulletins, page]);

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
      title: t("ui.bookmarks"),
      headerStyle: { backgroundColor: ACCENT },
      headerTintColor: "#1a1a2e",
    });
  }, [navigation]);

  const handleRefresh = useCallback(() => {
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    setLocalPage(0);
    dispatch(LoadBookmarkBulletin({ page: 1 }));
    setTimeout(() => {
      refreshingRef.current = false;
    }, 3000);
  }, [dispatch]);

  const handleLoadMore = useCallback(() => {
    const nextPage = localPage >= page ? page + 1 : localPage + 1;
    if (nextPage <= totalPage) {
      dispatch(LoadBookmarkBulletin({ page: nextPage }));
    }
  }, [dispatch, localPage, page, totalPage]);

  const handlePressBulletin = useCallback(
    (bulletin) => {
      // BulletinDetail is in the BulletinTab sub-stack; navigate through root.
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

  const hasMore = page < totalPage || localPage < totalPage;

  return (
    <View className="flex-1 bg-surface">
      {/* Header info */}
      <View className="px-4 py-3 bg-primary/5 border-b border-secondary-light/30">
        <View className="flex-row items-center gap-2">
          <Ionicons name="star" size={20} color={ACCENT} />
          <Text className="text-lg font-bold text-text-primary">
            {t("ui.bookmarked_posts")}
          </Text>
        </View>
        <Text className="text-xs text-text-secondary/70 mt-1">
          {t("ui.bookmarked_count", { count: allBulletins.length })}
        </Text>
      </View>

      <FlatList
        data={allBulletins}
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
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.3}
        ListEmptyComponent={
          <View className="flex-1 items-center justify-center py-20">
            <Ionicons name="star-outline" size={48} color="#d4c8a8" />
            <Text className="text-xl font-bold text-text-primary mt-3 mb-1">
              {t("ui.no_bookmarks")}
            </Text>
            <Text className="text-sm text-text-secondary text-center px-8">
              {t("ui.bookmark_hint")}
            </Text>
          </View>
        }
        ListFooterComponent={
          hasMore ? (
            <View className="py-4 items-center">
              <ActivityIndicator size="small" color={ACCENT} />
              <Text className="text-xs text-text-secondary/70 mt-1">
                {t("common.loading_more")}
              </Text>
            </View>
          ) : null
        }
      />
    </View>
  );
}
