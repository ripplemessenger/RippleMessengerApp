import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  TouchableOpacity,
  Modal,
  TextInput,
} from "react-native";
import Ionicons from "react-native-vector-icons/Ionicons";
import { useDispatch, useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import { useFocusEffect } from "@react-navigation/native";

import BulletinCard from "../components/Bulletin/BulletinCard";
import PublishModal from "../components/Bulletin/PublishModal";
import PasteModal from "../components/Bulletin/PasteModal";
import { selectPortalBulletins, selectMessengerConnStatus } from "../selectors";
import { LoadPortalBulletin } from "../store/sagas/messenger.actions";
import { ACCENT } from "../lib/theme";
import {
  setPublishFlag,
  setPublishTagList,
  setPasteFlag,
} from "../store/slices/MessengerSlice";

/**
 * BulletinScreen — main bulletin feed.
 *
 * Redux only stores one page at a time (shared with desktop). For the mobile
 * FlatList we accumulate pages locally: fetch page 1, then on scroll-end fetch
 * page 2 etc., concatenating results into `allBulletins` state. Pull-to-refresh
 * resets everything to page 1.
 */
export default function BulletinScreen({ navigation }) {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const {
    list: reduxBulletins,
    page: reduxPage,
    totalPage,
  } = useSelector(selectPortalBulletins);
  const isConnected = useSelector(selectMessengerConnStatus);

  // Locally accumulated bulletin list (across pages)
  const [allBulletins, setAllBulletins] = useState([]);
  const [localPage, setLocalPage] = useState(0);
  const refreshingRef = useRef(false);

  // Sync Redux page-1 data into local state whenever Redux updates
  useEffect(() => {
    if (reduxPage === 1 && reduxBulletins.length > 0) {
      setAllBulletins(reduxBulletins);
    } else if (reduxPage > 1 && reduxBulletins.length > 0) {
      // Append new page data
      setAllBulletins((prev) => [...prev, ...reduxBulletins]);
      setLocalPage(reduxPage);
    }
  }, [reduxBulletins, reduxPage]);

  // Load initial page when connected
  useFocusEffect(
    useCallback(() => {
      if (isConnected) {
        dispatch(LoadPortalBulletin({ page: 1 }));
      }
    }, [dispatch, isConnected]),
  );

  const handleRefresh = useCallback(() => {
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    setLocalPage(0);
    dispatch(LoadPortalBulletin({ page: 1 }));
    setTimeout(() => {
      refreshingRef.current = false;
    }, 3000);
  }, [dispatch]);

  const handleLoadMore = useCallback(() => {
    const nextPage = localPage >= reduxPage ? reduxPage + 1 : localPage + 1;
    if (nextPage <= totalPage) {
      dispatch(LoadPortalBulletin({ page: nextPage }));
    }
  }, [dispatch, localPage, reduxPage, totalPage]);

  const handlePressBulletin = useCallback(
    (bulletin) => {
      navigation.navigate("BulletinDetail", {
        hash: bulletin.hash,
        address: bulletin.address,
        sequence: bulletin.sequence,
      });
    },
    [navigation],
  );

  const handleTagPress = useCallback(
    (tag) => {
      // TagBulletins is in RootStack, above the tab stack.
      // Navigate via parent chain: bulletin tab → MainTabs (Tab) → RootStack
      navigation.getParent()?.getParent()?.navigate("TagBulletins", { tag });
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

  const hasMore = reduxPage < totalPage || localPage < totalPage;

  // Publish modal state & handlers
  const showPublishModal = useSelector(
    (state) => state.Messenger.ShowPublishFlag,
  );

  const handleOpenPublish = useCallback(() => {
    dispatch(setPublishTagList([]));
    dispatch(setPublishFlag(true));
  }, [dispatch]);

  // Paste bulletin modal state & handlers
  const showPasteModal = useSelector((state) => state.Messenger.ShowPasteFlag);

  const handleOpenPaste = useCallback(() => {
    dispatch(setPasteFlag(true));
  }, [dispatch]);

  // Tag search state & handlers
  const [showTagSearch, setShowTagSearch] = useState(false);
  const [searchTag, setSearchTag] = useState("");

  const handleTagSearchSubmit = useCallback(() => {
    const trimmed = searchTag.trim().replace(/^#/, "");
    if (!trimmed) return;
    setShowTagSearch(false);
    setSearchTag("");
    // TagBulletins is in RootStack, above the tab stack.
    navigation
      .getParent()
      ?.getParent()
      ?.navigate("TagBulletins", { tag: trimmed });
  }, [searchTag, navigation]);

  return (
    <View className="flex-1 bg-surface">
      {/* Header bar */}
      <View className="px-4 py-3 bg-primary/5 border-b border-secondary-light/30">
        <View className="flex-row items-center justify-between">
          <Text className="text-xl font-bold text-text-primary">
            {t("page.portal")}
          </Text>
          <Text className="text-xs text-text-secondary/50">
            {t("common.posts_count", { count: allBulletins.length })}
          </Text>
        </View>
        <View className="flex-row items-center gap-2 mt-2">
          <TouchableOpacity
            onPress={() =>
              navigation.getParent()?.getParent()?.navigate("FollowedBulletins")
            }
            activeOpacity={0.7}
            className="w-10 h-10 rounded-full bg-primary/10 items-center justify-center"
          >
            <Ionicons name="people" size={20} color={ACCENT} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() =>
              navigation.getParent()?.getParent()?.navigate("BookmarkBulletins")
            }
            activeOpacity={0.7}
            className="w-10 h-10 rounded-full bg-primary/10 items-center justify-center"
          >
            <Ionicons name="star" size={20} color={ACCENT} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() =>
              navigation.getParent()?.getParent()?.navigate("RandomBulletins")
            }
            activeOpacity={0.7}
            className="w-10 h-10 rounded-full bg-primary/10 items-center justify-center"
          >
            <Ionicons name="shuffle" size={20} color={ACCENT} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleOpenPaste}
            activeOpacity={0.7}
            className="w-10 h-10 rounded-full bg-primary/10 items-center justify-center"
          >
            <Ionicons name="clipboard" size={20} color={ACCENT} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setShowTagSearch(true)}
            activeOpacity={0.7}
            className="w-10 h-10 rounded-full bg-primary/10 items-center justify-center"
          >
            <Ionicons name="search" size={20} color={ACCENT} />
          </TouchableOpacity>
        </View>
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
            <Text className="text-5xl mb-4">📝</Text>
            <Text className="text-xl font-bold text-text-primary mb-2">
              {t("ui.no_posts_yet")}
            </Text>
            <Text className="text-sm text-text-secondary text-center px-8">
              {t("ui.feed_empty")}
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

      {/* Floating Action Button — publish */}
      <TouchableOpacity
        onPress={handleOpenPublish}
        activeOpacity={0.8}
        style={{
          position: "absolute",
          right: 20,
          bottom: 30,
          width: 56,
          height: 56,
          borderRadius: 28,
          backgroundColor: ACCENT,
          justifyContent: "center",
          alignItems: "center",
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 3 },
          shadowOpacity: 0.3,
          shadowRadius: 5,
          elevation: 6,
        }}
      >
        <Text style={{ fontSize: 32, fontWeight: "700", color: "#fff" }}>
          +
        </Text>
      </TouchableOpacity>

      {/* Publish Modal */}
      <PublishModal
        visible={showPublishModal}
        onClose={() => dispatch(setPublishFlag(false))}
      />

      {/* Paste Bulletin Modal */}
      <PasteModal
        visible={showPasteModal}
        onClose={() => dispatch(setPasteFlag(false))}
      />

      {/* Tag Search Modal */}
      <Modal
        visible={showTagSearch}
        transparent
        animationType="fade"
        onRequestClose={() => setShowTagSearch(false)}
      >
        <View className="flex-1 justify-center items-center bg-black/50 px-6">
          <View className="bg-surface-card rounded-2xl p-6 w-full gap-4 border border-secondary-light">
            <Text className="text-xl font-semibold text-text-primary text-center">
              {t("ui.search_tags")}
            </Text>
            <View className="flex-row items-center gap-2 bg-surface border border-secondary-light rounded-xl px-4">
              <Ionicons name="pricetag" size={18} color={ACCENT} />
              <TextInput
                value={`#${searchTag}`}
                onChangeText={(text) => setSearchTag(text.replace(/^#/, ""))}
                placeholder={t("ui.enter_tag_name")}
                placeholderTextColor="#9a9590"
                autoCapitalize="none"
                autoFocus
                onSubmitEditing={handleTagSearchSubmit}
                className="flex-1 py-3 text-text-primary text-sm"
              />
            </View>
            <View className="flex-row gap-3 mt-2">
              <TouchableOpacity
                onPress={() => {
                  setShowTagSearch(false);
                  setSearchTag("");
                }}
                className="flex-1 py-3 rounded-xl border border-secondary-light items-center"
              >
                <Text className="text-base font-medium text-text-secondary">
                  {t("common.cancel")}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleTagSearchSubmit}
                className="flex-1 bg-primary py-3 rounded-xl items-center"
              >
                <Text className="text-base font-semibold text-text-primary">
                  {t("ui.search")}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
