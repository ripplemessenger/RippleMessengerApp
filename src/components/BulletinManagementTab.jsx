import React, {
  useState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from "react";
import { View, Text, TouchableOpacity, FlatList, Alert } from "react-native";
import { useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import { useNavigation } from "@react-navigation/native";
import Ionicons from "react-native-vector-icons/Ionicons";

import { dbAPI } from "../db";

import { selectUserAddress, selectContactMap } from "../selectors";
import { ACCENT, ICON_MUTED } from "../lib/theme";
import { formatTime, shortenAddress } from "../lib/format";
import EmptyState from "./common/EmptyState";
import BottomSheet from "./common/BottomSheet";
import AvatarImage from "./AvatarImage";

const BULLETIN_PAGE_SIZE = 20;

const FILTER_OPTIONS = [
  { key: "all", labelKey: "bulletin.filter_all", icon: "document" },
  { key: "mine", labelKey: "bulletin.filter_mine", icon: "person" },
  { key: "bookmarked", labelKey: "bulletin.filter_bookmarked", icon: "star" },
  { key: "followed", labelKey: "bulletin.filter_followed", icon: "people" },
];

/**
 * BulletinManagementTab — settings tab for browsing/deleting locally cached bulletins.
 * Uses local state (transient data, no Redux slice needed).
 */
export default function BulletinManagementTab() {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const myAddress = useSelector(selectUserAddress);
  const contactMap = useSelector(selectContactMap);

  const [filter, setFilter] = useState("all");
  const [bulletins, setBulletins] = useState([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);

  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearchRef = useRef(null);

  // Tag filter state
  const [tags, setTags] = useState([]);
  const [selectedTag, setSelectedTag] = useState(null);
  const [tagModalVisible, setTagModalVisible] = useState(false);

  // Multi-select
  const [selectedHashes, setSelectedHashes] = useState([]);

  // Load bulletins for the current filter, page, search, tag, and sort
  const loadBulletins = useCallback(
    async (p = page) => {
      setLoading(true);
      try {
        let rows;
        const hasSearch = searchQuery && searchQuery.trim().length > 0;
        const hasTag = selectedTag !== null;

        if (hasSearch || hasTag) {
          // Use management APIs for search/tag queries
          if (hasTag) {
            rows = await dbAPI.getBulletinsByTag({
              tagName: selectedTag,
              page: p,
              pageSize: BULLETIN_PAGE_SIZE,
            });
          } else {
            rows = await dbAPI.searchBulletinsForManagement({
              query: searchQuery,
              filter,
              address: myAddress,
              page: p,
              pageSize: BULLETIN_PAGE_SIZE,
            });
          }
        } else {
          // Normal filter-based loading via management API
          rows = await dbAPI.getBulletinsForManagement({
            filter,
            address: myAddress,
            page: p,
            pageSize: BULLETIN_PAGE_SIZE,
          });
        }

        // Client-side sort by signed_at
        const sorted = (rows || []).sort((a, b) => {
          const ta = a.signed_at || 0;
          const tb = b.signed_at || 0;
          return tb - ta;
        });

        setBulletins(sorted);
      } catch (e) {
        console.error("[BulletinManagementTab] load error:", e);
      } finally {
        setLoading(false);
      }
    },
    [filter, myAddress, page, searchQuery, selectedTag],
  );

  useEffect(() => {
    setPage(1);
    loadBulletins(1);
  }, [filter]);

  // Load tags on mount
  useEffect(() => {
    dbAPI
      .getAllTags()
      .then(setTags)
      .catch(() => {});
  }, []);

  // Debounced search — reload when searchQuery changes (300ms delay)
  useEffect(() => {
    if (debouncedSearchRef.current) clearTimeout(debouncedSearchRef.current);
    debouncedSearchRef.current = setTimeout(() => {
      setPage(1);
      loadBulletins(1);
    }, 300);
    return () => {
      if (debouncedSearchRef.current) clearTimeout(debouncedSearchRef.current);
    };
  }, [searchQuery]);

  // Reload when tag selection changes
  useEffect(() => {
    if (selectedTag !== null) {
      setPage(1);
      loadBulletins(1);
    }
  }, [selectedTag]);

  const handlePageChange = useCallback(
    (newPage) => {
      if (newPage < 1) return;
      setPage(newPage);
      loadBulletins(newPage);
    },
    [loadBulletins],
  );

  // Toggle selection of a single bulletin hash
  const toggleSelectHash = useCallback((hash) => {
    setSelectedHashes((prev) => {
      if (prev.includes(hash)) return prev.filter((h) => h !== hash);
      return [...prev, hash];
    });
  }, []);

  // Delete selected bulletins (safety: filter out protected bulletins)
  const handleDeleteSelected = useCallback(() => {
    // Filter out protected bulletins (own, bookmarked, followed) as safety net
    const deletableHashes = selectedHashes.filter((hash) => {
      const b = bulletins.find((item) => (item.Hash || item.hash) === hash);
      if (!b) return false;
      const addr = b.Address || b.address;
      const marked = b.is_marked === true || b.is_marked === 1;
      const followed = b.is_followed === true || b.is_followed === 1;
      return addr !== myAddress && !marked && !followed;
    });
    if (deletableHashes.length === 0) return;
    Alert.alert(
      t("bulletin.delete_selected_title"),
      t("bulletin.delete_selected_confirm", { count: deletableHashes.length }),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("common.delete"),
          style: "destructive",
          onPress: async () => {
            try {
              await dbAPI.deleteBulletinsByHashes(deletableHashes);
              setSelectedHashes([]);
              loadBulletins(page);
            } catch (e) {
              Alert.alert(t("common.error"), t("bulletin.delete_failed"));
            }
          },
        },
      ],
    );
  }, [selectedHashes, bulletins, myAddress, loadBulletins, page]);

  // Open JSON preview modal
  // Tag picker handler
  const handleSelectTag = useCallback((tagName) => {
    setSelectedTag(tagName);
    setSearchQuery("");
    setTagModalVisible(false);
  }, []);

  const truncateContent = useCallback((content) => {
    if (!content) return "";
    return content.length > 256 ? content.slice(0, 256) + "..." : content;
  }, []);

  const renderBulletinItem = useCallback(
    ({ item: b }) => {
      const hash = b.Hash || b.hash;
      const address = b.Address || b.address;
      const content = b.Content || b.content || b.content_preview || "";
      const tagsList = b.tag || [];
      const isSelected = selectedHashes.includes(hash);

      // Resolve display name: contact nickname > DB nickname > "Me" > shortened address
      const displayName =
        address === myAddress
          ? t("common.me")
          : (contactMap && contactMap[address]) ||
            b.nickname ||
            shortenAddress(address);

      const isOwn = address === myAddress;
      const isMarked = b.is_marked === true || b.is_marked === 1;
      const isFollowed = b.is_followed === true || b.is_followed === 1;
      const isProtected = isOwn || isMarked || isFollowed;

      return (
        <View
          className={`bg-surface-card rounded-xl p-3 border mb-1.5 ${
            isSelected ? "border-primary shadow-sm" : "border-secondary-light"
          }`}
        >
          {/* Header row: checkbox/lock + avatar + bulletin link + time */}
          <View className="flex-row items-center gap-2 mb-1">
            {isProtected ? (
              <TouchableOpacity className="p-1" activeOpacity={0.6}>
                <Ionicons name="lock-closed" size={18} color={ICON_MUTED} />
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                onPress={() => toggleSelectHash(hash)}
                className="p-1"
                activeOpacity={0.6}
              >
                <View
                  className={`w-5 h-5 rounded border ${
                    isSelected
                      ? "bg-primary border-primary"
                      : "border-text-secondary/40"
                  } items-center justify-center`}
                >
                  {isSelected && (
                    <Ionicons name="checkmark" size={12} color="#fff" />
                  )}
                </View>
              </TouchableOpacity>
            )}
            <View className="flex-row items-center gap-2 flex-1 min-w-0">
              <AvatarImage address={address} nickname={displayName} size={32} />
              <View className="flex-1 min-w-0">
                <View className="flex-row items-center gap-1">
                  <View className="px-2 py-0.5 rounded-full border border-primary/30 bg-primary/5">
                    <Text className="text-xs font-semibold text-primary-dark">
                      {displayName}#{b.sequence}
                    </Text>
                  </View>
                </View>
                <Text className="text-[10px] text-text-secondary/70">
                  {formatTime(b.SignedAt || b.signed_at)}
                </Text>
              </View>
            </View>
          </View>

          {/* Content preview */}
          <View className="flex-1">
            <Text className="text-sm text-text-primary mb-2" numberOfLines={3}>
              {truncateContent(content)}
            </Text>

            {/* Tags as pills */}
            {tagsList.length > 0 && (
              <View className="flex-row flex-wrap gap-1.5">
                {tagsList.map((tag, idx) => (
                  <View
                    key={String(idx)}
                    className="bg-primary/15 px-2 py-0.5 rounded-full"
                  >
                    <Text className="text-xs text-primary">{tag}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        </View>
      );
    },
    [
      shortenAddress,
      truncateContent,
      selectedHashes,
      toggleSelectHash,
      myAddress,
      contactMap,
      t,
    ],
  );

  const emptyState = useMemo(
    () => (
      <EmptyState
        icon="document-outline"
        title={t("bulletin.no_bulletins")}
        hint={
          filter !== "all"
            ? t("bulletin.no_filter_found", { filter: filter })
            : t("bulletin.no_cached")
        }
      />
    ),
    [filter, t],
  );

  return (
    <View className="flex-1 gap-3 bg-surface">
      {/* Header */}
      <View className="flex-row items-center px-3 py-2 bg-primary/5 border-b border-secondary-light/30">
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          activeOpacity={0.6}
        >
          <Ionicons name="arrow-back" size={24} color={ICON_MUTED} />
        </TouchableOpacity>
        <Text
          className="text-lg font-semibold text-text-primary flex-1 ml-2"
          numberOfLines={1}
        >
          {selectedHashes.length > 0
            ? `${selectedHashes.length} selected`
            : t("setting.bulletin_cache")}
        </Text>
        {/* Select All / Deselect All */}
        <TouchableOpacity
          onPress={() => {
            const nonProtected = bulletins
              .filter((b) => {
                const addr = b.Address || b.address;
                const marked = b.is_marked === true || b.is_marked === 1;
                const followed = b.is_followed === true || b.is_followed === 1;
                return addr !== myAddress && !marked && !followed;
              })
              .map((b) => b.Hash || b.hash);
            if (
              nonProtected.length > 0 &&
              nonProtected.every((h) => selectedHashes.includes(h))
            ) {
              setSelectedHashes([]);
            } else {
              setSelectedHashes(nonProtected);
            }
          }}
          activeOpacity={0.6}
          className="p-1"
        >
          <Ionicons
            name={
              bulletins.length > 0 &&
              bulletins
                .filter((b) => {
                  const addr = b.Address || b.address;
                  const marked = b.is_marked === true || b.is_marked === 1;
                  const followed =
                    b.is_followed === true || b.is_followed === 1;
                  return addr !== myAddress && !marked && !followed;
                })
                .every((b) => selectedHashes.includes(b.Hash || b.hash))
                ? "close-circle-outline"
                : "checkmark-done-outline"
            }
            size={22}
            color={ICON_MUTED}
          />
        </TouchableOpacity>
        {/* Delete */}
        <TouchableOpacity
          onPress={handleDeleteSelected}
          disabled={selectedHashes.length === 0}
          activeOpacity={0.6}
          className="p-1 ml-1"
        >
          <Ionicons
            name="trash-outline"
            size={22}
            color={selectedHashes.length > 0 ? "#ef4444" : ICON_MUTED}
          />
        </TouchableOpacity>
      </View>

      {/* Filter chips */}
      <View className="flex-row bg-surface-card rounded-xl p-1 border border-secondary-light">
        {FILTER_OPTIONS.map((opt) => {
          const isActive = filter === opt.key;
          return (
            <TouchableOpacity
              key={opt.key}
              onPress={() => setFilter(opt.key)}
              className={`flex-1 py-2 rounded-lg items-center ${
                isActive ? "bg-primary/15" : ""
              }`}
            >
              <Ionicons
                name={isActive ? opt.icon : `${opt.icon}-outline`}
                size={14}
                color={isActive ? ACCENT : ICON_MUTED}
              />
              <Text
                className={`text-[10px] font-medium mt-0.5 ${
                  isActive ? "text-primary" : "text-text-secondary"
                }`}
              >
                {t(opt.labelKey)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Bulletin list */}
      {bulletins.length > 0 ? (
        <FlatList
          data={bulletins}
          keyExtractor={(item) => item.Hash || item.hash}
          renderItem={renderBulletinItem}
          contentContainerClassName="gap-2 pb-4"
          showsVerticalScrollIndicator={false}
        />
      ) : (
        emptyState
      )}

      {/* Page indicator */}
      {
        <View className="flex-row items-center justify-between px-2">
          <TouchableOpacity
            onPress={() => handlePageChange(page - 1)}
            disabled={page <= 1 || loading}
            className={`py-2 px-4 rounded-lg ${
              page > 1
                ? "bg-surface-card border border-secondary-light"
                : "opacity-30"
            }`}
          >
            <View className="flex-row items-center gap-1">
              <Ionicons name="chevron-back" size={14} color={ICON_MUTED} />
              <Text className="text-xs text-text-secondary">
                {t("common.prev")}
              </Text>
            </View>
          </TouchableOpacity>
          <Text className="text-xs text-text-secondary/60">
            {t("bulletin.page_indicator", { count: page })}
          </Text>
          <TouchableOpacity
            onPress={() => handlePageChange(page + 1)}
            disabled={loading}
            className="py-2 px-4 rounded-lg bg-surface-card border border-secondary-light"
          >
            <View className="flex-row items-center gap-1">
              <Text className="text-xs text-text-secondary">
                {t("common.next")}
              </Text>
              <Ionicons name="chevron-forward" size={14} color={ICON_MUTED} />
            </View>
          </TouchableOpacity>
        </View>
      }

      {/* Tag Picker Modal */}
      <BottomSheet
        visible={tagModalVisible}
        onClose={() => setTagModalVisible(false)}
        title={t("bulletin.filter_by_tag")}
      >
        <FlatList
          data={tags}
          keyExtractor={(item) => item}
          renderItem={({ item: tagName }) => (
            <TouchableOpacity
              onPress={() => handleSelectTag(tagName)}
              className={`py-3 px-2 rounded-lg ${
                selectedTag === tagName ? "bg-primary/15" : ""
              }`}
            >
              <View className="flex-row items-center gap-2">
                <Ionicons
                  name={
                    selectedTag === tagName
                      ? "checkmark-circle"
                      : "ellipse-outline"
                  }
                  size={18}
                  color={selectedTag === tagName ? ACCENT : ICON_MUTED}
                />
                <Text
                  className={`text-sm ${
                    selectedTag === tagName
                      ? "text-primary font-medium"
                      : "text-text-primary"
                  }`}
                >
                  {tagName}
                </Text>
              </View>
            </TouchableOpacity>
          )}
          contentContainerClassName="gap-1 pb-4"
        />
      </BottomSheet>
    </View>
  );
}
