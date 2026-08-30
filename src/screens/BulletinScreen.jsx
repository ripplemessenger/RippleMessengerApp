import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  FlatList,
  RefreshControl,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
} from "react-native";
import Ionicons from "react-native-vector-icons/Ionicons";
import { useDispatch, useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import { useFocusEffect } from "@react-navigation/native";

import BulletinCard from "../components/Bulletin/BulletinCard";
import PublishModal from "../components/Bulletin/PublishModal";
import PasteModal from "../components/Bulletin/PasteModal";
import EmptyState from "../components/common/EmptyState";
import ListFooter from "../components/common/ListFooter";
import ModalShell from "../components/common/ModalShell";
import ConfirmButtonRow from "../components/common/ConfirmButtonRow";
import { selectPortalBulletins, selectMessengerConnStatus } from "../selectors";
import { LoadPortalBulletin } from "../store/sagas/messenger.actions";
import { ACCENT, PLACEHOLDER } from "../lib/theme";
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
  const [loadedPage, setLoadedPage] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Distinguish "initial load in flight" from "loaded but empty".
  // The saga always dispatches a NEW array reference, so a reference change
  // is a reliable "first response arrived" signal (initial Redux state and
  // "loaded empty" both have list: [], so we can't tell them apart by length).
  const initialListRef = useRef(null);
  if (initialListRef.current === null) {
    initialListRef.current = reduxBulletins;
  }
  const hasLoaded = reduxBulletins !== initialListRef.current;

  // Sync Redux page data into local state whenever Redux updates
  useEffect(() => {
    if (reduxBulletins.length === 0) return;
    if (reduxPage === 1) {
      // Initial load or pull-to-refresh — reset to page 1
      setAllBulletins(reduxBulletins);
      setLoadedPage(1);
    } else if (reduxPage > loadedPage) {
      // A newer page arrived — append it
      setAllBulletins((prev) => [...prev, ...reduxBulletins]);
      setLoadedPage(reduxPage);
    }
    setLoadingMore(false);
  }, [reduxBulletins, reduxPage, loadedPage]);

  // Load initial page when connected
  useFocusEffect(
    useCallback(() => {
      if (isConnected) {
        dispatch(LoadPortalBulletin({ page: 1 }));
      }
    }, [dispatch, isConnected]),
  );

  const handleRefresh = useCallback(() => {
    if (refreshing) return;
    setRefreshing(true);
    setLoadedPage(0);
    dispatch(LoadPortalBulletin({ page: 1 }));
    setTimeout(() => {
      setRefreshing(false);
    }, 3000);
  }, [dispatch, refreshing]);

  const handleLoadMore = useCallback(() => {
    if (loadingMore) return;
    const nextPage = loadedPage + 1;
    if (nextPage <= totalPage) {
      setLoadingMore(true);
      dispatch(LoadPortalBulletin({ page: nextPage }));
    }
  }, [dispatch, loadingMore, loadedPage, totalPage]);

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

  const handleAvatarPress = useCallback(
    (address) => {
      // AddressBulletins is in RootStack, above the tab stack.
      navigation
        .getParent()
        ?.getParent()
        ?.navigate("AddressBulletins", { address });
    },
    [navigation],
  );

  const renderItem = useCallback(
    ({ item }) => (
      <BulletinCard
        bulletin={item}
        onPress={() => handlePressBulletin(item)}
        onTagPress={handleTagPress}
        onAvatarPress={handleAvatarPress}
      />
    ),
    [handlePressBulletin, handleTagPress, handleAvatarPress],
  );

  const keyExtractor = useCallback((item) => item.hash, []);

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
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={ACCENT}
          />
        }
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.3}
        ListEmptyComponent={
          hasLoaded ? (
            <EmptyState
              icon="document-text-outline"
              title={t("ui.no_posts_yet")}
              hint={t("ui.feed_empty")}
            />
          ) : (
            <View className="flex-1 items-center justify-center py-16">
              <ActivityIndicator size="large" color={ACCENT} />
            </View>
          )
        }
        ListFooterComponent={<ListFooter loading={loadingMore} />}
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
      <ModalShell
        visible={showTagSearch}
        onClose={() => {
          setShowTagSearch(false);
          setSearchTag("");
        }}
        title={t("ui.search_tags")}
      >
        <View className="flex-row items-center gap-2 bg-surface border border-secondary-light rounded-xl px-4">
          <Ionicons name="pricetag" size={18} color={ACCENT} />
          <TextInput
            value={`#${searchTag}`}
            onChangeText={(text) => setSearchTag(text.replace(/^#/, ""))}
            placeholder={t("ui.enter_tag_name")}
            placeholderTextColor={PLACEHOLDER}
            autoCapitalize="none"
            autoFocus
            onSubmitEditing={handleTagSearchSubmit}
            className="flex-1 py-3 text-text-primary text-sm"
          />
        </View>
        <ConfirmButtonRow
          onConfirm={handleTagSearchSubmit}
          confirmText={t("ui.search")}
          showCancel={false}
        />
      </ModalShell>
    </View>
  );
}
