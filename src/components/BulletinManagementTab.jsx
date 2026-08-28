import React, {
  useState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from "react";
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  Alert,
  ScrollView,
} from "react-native";
import { useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import { useNavigation } from "@react-navigation/native";
import Ionicons from "react-native-vector-icons/Ionicons";

import { dbAPI } from "../db";

import { selectUserAddress } from "../selectors";
import { ACCENT, ICON_MUTED } from "../lib/theme";
import { formatTime, shortenAddress } from "../lib/format";
import SearchBar from "./common/SearchBar";
import EmptyState from "./common/EmptyState";
import BottomSheet from "./common/BottomSheet";

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

  const [filter, setFilter] = useState("all");
  const [bulletins, setBulletins] = useState([]);
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(false);

  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearchRef = useRef(null);

  // Tag filter state
  const [tags, setTags] = useState([]);
  const [selectedTag, setSelectedTag] = useState(null);
  const [tagModalVisible, setTagModalVisible] = useState(false);

  // Multi-select mode
  const [selectMode, setSelectMode] = useState(false);
  const [selectedHashes, setSelectedHashes] = useState([]);

  // Sort order
  const [sortOrder, setSortOrder] = useState("desc");

  // JSON preview modal
  const [jsonModalVisible, setJsonModalVisible] = useState(false);
  const [previewBulletin, setPreviewBulletin] = useState(null);

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
          return sortOrder === "desc" ? tb - ta : ta - tb;
        });

        setBulletins(sorted);
      } catch (e) {
        console.error("[BulletinManagementTab] load error:", e);
      } finally {
        setLoading(false);
      }
    },
    [filter, myAddress, page, searchQuery, selectedTag, sortOrder],
  );

  // Load count summary for current filter
  const loadSummary = useCallback(async () => {
    try {
      const count =
        (await dbAPI.getBulletinCountForManagement?.({
          filter,
          address: myAddress,
        })) || 0;
      setTotalCount(count);
    } catch {
      // silent — non-critical
    }
  }, [filter, myAddress]);

  useEffect(() => {
    setPage(1);
    loadBulletins(1);
    loadSummary();
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
      loadSummary();
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
      loadSummary();
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

  // Enter select mode with an optional pre-selected hash
  const enterSelectMode = useCallback((hash) => {
    setSelectMode(true);
    if (hash) setSelectedHashes([hash]);
  }, []);

  // Exit select mode
  const exitSelectMode = useCallback(() => {
    setSelectMode(false);
    setSelectedHashes([]);
  }, []);

  // Delete selected bulletins
  const handleDeleteSelected = useCallback(() => {
    Alert.alert(
      t("bulletin.delete_selected_title"),
      t("bulletin.delete_selected_confirm", { count: selectedHashes.length }),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("common.delete"),
          style: "destructive",
          onPress: async () => {
            try {
              await dbAPI.deleteBulletinsByHashes(selectedHashes);
              exitSelectMode();
              loadBulletins(page);
              loadSummary();
            } catch (e) {
              Alert.alert(t("common.error"), t("bulletin.delete_failed"));
            }
          },
        },
      ],
    );
  }, [selectedHashes, exitSelectMode, loadBulletins, loadSummary, page]);

  // Open JSON preview modal
  const handlePreviewBulletin = useCallback(async (hash) => {
    try {
      const bulletin = await dbAPI.getBulletinByHash(hash);
      setPreviewBulletin(bulletin);
      setJsonModalVisible(true);
    } catch (e) {
      console.error("[BulletinManagementTab] preview error:", e);
    }
  }, []);

  // Tag picker handler
  const handleSelectTag = useCallback((tagName) => {
    setSelectedTag(tagName);
    setSearchQuery("");
    setTagModalVisible(false);
  }, []);

  const handleClearTag = useCallback(() => {
    setSelectedTag(null);
  }, []);

  const handleClearAll = useCallback(() => {
    Alert.alert(
      t("bulletin.clear_all_title"),
      t("bulletin.clear_all_confirm", { count: totalCount }),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("bulletin.clear_all"),
          style: "destructive",
          onPress: async () => {
            try {
              await dbAPI.clearAllBulletins();
              setBulletins([]);
              setTotalCount(0);
            } catch (e) {
              Alert.alert(t("common.error"), t("bulletin.clear_failed"));
            }
          },
        },
      ],
    );
  }, [totalCount]);

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

      return (
        <TouchableOpacity
          onPress={() => {
            if (selectMode) {
              toggleSelectHash(hash);
            } else {
              handlePreviewBulletin(hash);
            }
          }}
          onLongPress={() => {
            if (!selectMode) {
              enterSelectMode(hash);
            }
          }}
          delayLongPress={500}
          activeOpacity={0.7}
          className={`bg-surface-card rounded-xl p-4 border ${
            isSelected ? "border-primary shadow-sm" : "border-secondary-light"
          }`}
        >
          {/* Header row: checkbox + date + author */}
          <View className="flex-row items-center justify-between mb-2">
            <View className="flex-row items-center gap-2">
              {selectMode && (
                <View
                  className={`w-4 h-4 rounded border ${
                    isSelected
                      ? "bg-primary border-primary"
                      : "border-text-secondary/40"
                  } items-center justify-center`}
                >
                  {isSelected && (
                    <Ionicons name="checkmark" size={10} color="#fff" />
                  )}
                </View>
              )}
              <Text className="text-xs text-text-secondary/60">
                {formatTime(b.SignedAt || b.signed_at)}
              </Text>
            </View>
            <Text className="text-xs font-mono text-text-secondary/50 truncate max-w-[120px]">
              {shortenAddress(address)}
            </Text>
          </View>

          {/* Content preview */}
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

          {/* Hash indicator */}
          <Text className="text-[10px] font-mono text-text-secondary/30 mt-2">
            {hash.slice(0, 20)}...
          </Text>
        </TouchableOpacity>
      );
    },
    [
      shortenAddress,
      truncateContent,
      selectMode,
      selectedHashes,
      toggleSelectHash,
      enterSelectMode,
      handlePreviewBulletin,
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
          {t("setting.bulletin_cache")}
        </Text>
      </View>

      {/* Select mode header */}
      {selectMode && (
        <View className="flex-row items-center justify-between bg-primary/10 rounded-xl px-4 py-2 border border-primary/30">
          <TouchableOpacity onPress={exitSelectMode}>
            <Text className="text-sm font-medium text-primary">
              {t("common.done")}
            </Text>
          </TouchableOpacity>
          <Text className="text-xs text-text-secondary">
            {t("bulletin.selected_count", { count: selectedHashes.length })}
          </Text>
          <TouchableOpacity
            onPress={handleDeleteSelected}
            disabled={selectedHashes.length === 0}
          >
            <Text
              className={`text-sm font-semibold ${
                selectedHashes.length > 0
                  ? "text-status-error"
                  : "text-text-secondary/30"
              }`}
            >
              {t("bulletin.delete_count", { count: selectedHashes.length })}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Search bar */}
      <SearchBar
        value={searchQuery}
        onChange={setSearchQuery}
        placeholder={t("bulletin.search_placeholder")}
      />

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

      {/* Summary bar with tag filter and sort toggle */}
      <View className="flex-row items-center justify-between px-1">
        <Text className="text-xs text-text-secondary/70">
          {t("bulletin.total_count", { count: totalCount.toLocaleString() })}
        </Text>
        <View className="flex-row items-center gap-2">
          {/* Tag filter button */}
          {tags.length > 0 && (
            <TouchableOpacity
              onPress={() => setTagModalVisible(true)}
              className="flex-row items-center gap-1 bg-surface-card px-2 py-1 rounded border border-secondary-light"
            >
              <Ionicons name="pricetags-outline" size={14} color={ICON_MUTED} />
              {selectedTag && (
                <>
                  <Text className="text-[10px] text-primary">
                    {selectedTag}
                  </Text>
                  <TouchableOpacity onPress={handleClearTag}>
                    <Ionicons name="close-circle" size={12} color="#ef4444" />
                  </TouchableOpacity>
                </>
              )}
            </TouchableOpacity>
          )}

          {/* Select toggle */}
          <TouchableOpacity
            onPress={() => {
              if (selectMode) exitSelectMode();
              else enterSelectMode();
            }}
            className="flex-row items-center gap-1 bg-surface-card px-2 py-1 rounded border border-secondary-light"
          >
            <Ionicons
              name={selectMode ? "checkmark-done" : "checkmark-circle-outline"}
              size={14}
              color={selectMode ? ACCENT : ICON_MUTED}
            />
          </TouchableOpacity>

          {/* Sort toggle */}
          <TouchableOpacity
            onPress={() => setSortOrder(sortOrder === "desc" ? "asc" : "desc")}
            className="flex-row items-center gap-1 bg-surface-card px-2 py-1 rounded border border-secondary-light"
          >
            <Ionicons
              name={sortOrder === "desc" ? "arrow-down" : "arrow-up"}
              size={14}
              color={ICON_MUTED}
            />
          </TouchableOpacity>
        </View>
      </View>

      {/* Bulletin list */}
      {!selectMode && bulletins.length > 0 ? (
        <FlatList
          data={bulletins}
          keyExtractor={(item) => item.Hash || item.hash}
          renderItem={renderBulletinItem}
          contentContainerClassName="gap-2 pb-4"
          showsVerticalScrollIndicator={false}
        />
      ) : selectMode ? (
        bulletins.length > 0 ? (
          <FlatList
            data={bulletins}
            keyExtractor={(item) => item.Hash || item.hash}
            renderItem={renderBulletinItem}
            contentContainerClassName="gap-2 pb-4"
            showsVerticalScrollIndicator={false}
          />
        ) : null
      ) : (
        emptyState
      )}

      {/* Page indicator */}
      {!selectMode && (
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
      )}

      {/* Clear All button (hidden in select mode) */}
      {!selectMode && totalCount > 0 && (
        <TouchableOpacity
          onPress={handleClearAll}
          className="border-2 border-status-error/50 py-3 rounded-xl items-center"
        >
          <View className="flex-row items-center gap-2">
            <Ionicons name="trash-outline" size={16} color="#ef4444" />
            <Text className="text-base font-semibold text-status-error">
              Clear All ({totalCount})
            </Text>
          </View>
        </TouchableOpacity>
      )}

      {/* JSON Preview Modal */}
      <BottomSheet
        visible={jsonModalVisible}
        onClose={() => setJsonModalVisible(false)}
        title={t("bulletin.json_title")}
      >
        <ScrollView className="max-h-[70vh]">
          {previewBulletin && (
            <View className="bg-black/10 rounded-xl p-3">
              <Text className="text-xs font-mono text-text-primary whitespace-pre-wrap">
                {JSON.stringify(previewBulletin, null, 2)}
              </Text>
            </View>
          )}
        </ScrollView>
      </BottomSheet>

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
