import React, { useState, useCallback, useEffect, useMemo } from "react";
import { View, Text, TouchableOpacity, FlatList, Alert } from "react-native";
import { useTranslation } from "react-i18next";
import Ionicons from "react-native-vector-icons/Ionicons";

import RNFS from "react-native-fs";
import { dbAPI } from "../db";
import * as fileService from "../services/fileService";
import { filesize_format } from "../lib/AppUtil";
import { formatTime } from "../lib/format";
import { ACCENT, ICON_MUTED } from "../lib/theme";
import EmptyState from "./common/EmptyState";

const STORAGE_PAGE_SIZE = 20;

const CATEGORY_CHIPS = [
  { key: "all", labelKey: "storage.chip_all" },
  { key: "bulletin", labelKey: "storage.chip_bulletin" },
  { key: "private_chat", labelKey: "storage.chip_chat" },
  { key: "orphaned", labelKey: "storage.chip_orphaned" },
];

const CATEGORY_META = {
  bulletin: {
    color: "#3b82f6",
    bgColor: "bg-blue-500/20",
    icon: "document-outline",
  },
  private_chat: {
    color: "#10b981",
    bgColor: "bg-green-500/20",
    icon: "chatbubble-outline",
  },
  group_chat: {
    color: "#a855f7",
    bgColor: "bg-purple-500/20",
    icon: "people-outline",
  },
  orphaned: {
    color: "#ef4444",
    bgColor: "bg-red-500/20",
    icon: "warning-outline",
  },
};

/**
 * Get an Ionicons name based on file extension.
 */
function getFileIcon(ext) {
  if (!ext) return "document-outline";
  const e = ext.toLowerCase();
  if (["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp"].includes(e))
    return "image-outline";
  if (["pdf"].includes(e)) return "document-text-outline";
  if (["mp4", "mov", "avi", "mkv", "webm"].includes(e))
    return "videocam-outline";
  if (["mp3", "wav", "ogg", "flac", "aac"].includes(e))
    return "musical-notes-outline";
  if (["zip", "rar", "7z", "tar", "gz"].includes(e)) return "archive-outline";
  if (["txt", "md", "log"].includes(e)) return "text-outline";
  return "document-outline";
}

/**
 * StorageManagementTab — settings tab for browsing/deleting cached files.
 * Uses local state (transient data, no Redux slice needed).
 */
export default function StorageManagementTab() {
  const { t } = useTranslation();
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [files, setFiles] = useState([]);
  const [page, setPage] = useState(1);
  const [summary, setSummary] = useState({
    total: 0,
    bulletinSize: 0,
    chatFileSize: 0,
    avatarSize: 0,
    orphanedSize: 0,
  });
  const [loading, setLoading] = useState(false);

  // Multi-select mode
  const [selectMode, setSelectMode] = useState(false);
  const [selectedHashes, setSelectedHashes] = useState([]);

  // Load cached files from DB + filesystem
  const loadFiles = useCallback(
    async (p = page) => {
      setLoading(true);
      try {
        const rows = await dbAPI.getCachedFiles(p, STORAGE_PAGE_SIZE);
        // Enrich with actual file existence check and size
        const enriched = await Promise.all(
          (rows || []).map(async (row) => {
            const filePath = fileService.getFileFullPath(row.hash);
            const stat = await fileService.statFile(filePath);
            return {
              ...row,
              exists: stat.exists,
              realSize: stat.size || row.size || 0,
            };
          }),
        );
        setFiles(enriched);
      } catch (e) {
        console.error("[StorageManagementTab] load error:", e);
      } finally {
        setLoading(false);
      }
    },
    [page],
  );

  // Load storage summary by category
  const loadSummary = useCallback(async () => {
    try {
      const allFiles = (await dbAPI.getCachedFiles(1, 99999)) || [];

      let bulletinSize = 0;
      let chatFileSize = 0;
      let orphanedSize = 0;

      for (const f of allFiles) {
        const filePath = fileService.getFileFullPath(f.hash);
        const stat = await fileService.statFile(filePath);
        const sz = stat.size || 0;
        if (f.category === "bulletin") {
          bulletinSize += sz;
        } else if (
          f.category === "private_chat" ||
          f.category === "group_chat"
        ) {
          chatFileSize += sz;
        } else if (f.category === "orphaned") {
          orphanedSize += sz;
        }
      }

      // Avatar size from filesystem
      let avatarSize = 0;
      try {
        const baseDir =
          (RNFS.DocumentDirectoryPath || "") + "/ripplemessenger/avatars";
        const dirExists = await RNFS.exists(baseDir);
        if (dirExists) {
          const avatarFiles = await RNFS.readDir(baseDir).catch(() => []);
          for (const af of avatarFiles) {
            avatarSize += af.size || 0;
          }
        }
      } catch {
        // silent — avatars are optional
      }

      setSummary({
        total: allFiles.length,
        bulletinSize,
        chatFileSize,
        avatarSize,
        orphanedSize,
      });
    } catch (e) {
      console.error("[StorageManagementTab] summary error:", e);
    }
  }, []);

  useEffect(() => {
    loadFiles();
    loadSummary();
  }, []);

  // Reload when filter changes — re-fetch and filter client-side
  const handleFilterChange = useCallback((newFilter) => {
    setCategoryFilter(newFilter);
    setPage(1);
    // Files are already loaded; filtering is applied in renderItem via useMemo
  }, []);

  const handlePageChange = useCallback((newPage) => {
    if (newPage < 1) return;
    setPage(newPage);
  }, []);

  const handleDeleteFile = useCallback(
    async (fileRow) => {
      Alert.alert(
        t("storage.delete_file_title"),
        t("storage.delete_file_confirm", {
          name: fileRow.file_name || fileRow.hash.slice(0, 16),
        }),
        [
          { text: t("common.cancel"), style: "cancel" },
          {
            text: t("common.delete"),
            style: "destructive",
            onPress: async () => {
              try {
                // Delete from filesystem
                const filePath = fileService.getFileFullPath(fileRow.hash);
                await fileService.deleteFile(filePath);

                // Remove DB references, then the record itself
                await dbAPI.removeFileReferences(fileRow.hash);
                await dbAPI.deleteFileRecord(fileRow.hash);

                loadFiles(page);
                loadSummary();
              } catch (e) {
                Alert.alert(t("common.error"), t("storage.delete_failed"));
              }
            },
          },
        ],
      );
    },
    [loadFiles, loadSummary, page],
  );

  const handleClearOrphaned = useCallback(async () => {
    // Always clear all orphaned files, regardless of current filter
    const orphaned = files.filter((f) => f.category === "orphaned");
    if (orphaned.length === 0) return;

    Alert.alert(
      t("storage.clear_orphaned_title"),
      t("storage.clear_orphaned_confirm", { count: orphaned.length }),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("storage.clear_all"),
          style: "destructive",
          onPress: async () => {
            for (const f of orphaned) {
              try {
                const filePath = fileService.getFileFullPath(f.hash);
                await fileService.deleteFile(filePath);
                await dbAPI.removeFileReferences(f.hash);
                await dbAPI.deleteFileRecord(f.hash);
              } catch {
                // Skip individual failures
              }
            }
            loadFiles(page);
            loadSummary();
          },
        },
      ],
    );
  }, [files, loadFiles, loadSummary, page]);

  // Toggle selection of a single file hash
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

  // Delete selected files
  const handleDeleteSelected = useCallback(async () => {
    Alert.alert(
      t("storage.delete_selected_title"),
      t("storage.delete_selected_confirm", { count: selectedHashes.length }),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("common.delete"),
          style: "destructive",
          onPress: async () => {
            for (const hash of selectedHashes) {
              try {
                const filePath = fileService.getFileFullPath(hash);
                await fileService.deleteFile(filePath);
              } catch {
                /* skip */
              }
            }
            await dbAPI.deleteFilesByHashes(selectedHashes);
            exitSelectMode();
            loadFiles(page);
            loadSummary();
          },
        },
      ],
    );
  }, [selectedHashes, exitSelectMode, loadFiles, loadSummary, page]);

  // Clear avatar cache
  const handleClearAvatars = useCallback(() => {
    Alert.alert(t("storage.clear_avatar_title"), t("storage.clear_confirm"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("storage.clear"),
        style: "destructive",
        onPress: async () => {
          try {
            await dbAPI.clearAvatars();
            loadSummary();
          } catch (e) {
            Alert.alert(t("common.error"), t("storage.clear_failed"));
          }
        },
      },
    ]);
  }, [loadSummary]);

  // Filter files by category
  const filteredFiles = useMemo(() => {
    if (categoryFilter === "all") return files;
    return files.filter((f) => f.category === categoryFilter);
  }, [files, categoryFilter]);

  const orphanedCount = useMemo(
    () => files.filter((f) => f.category === "orphaned").length,
    [files],
  );

  const renderFileItem = useCallback(
    ({ item: f }) => {
      const meta = CATEGORY_META[f.category] || CATEGORY_META.orphaned;
      const ext = (f.file_ext || "").replace(".", "");
      const icon = getFileIcon(ext);
      const isSelected = selectedHashes.includes(f.hash);

      return (
        <TouchableOpacity
          onPress={() => {
            if (selectMode) toggleSelectHash(f.hash);
          }}
          onLongPress={() => {
            if (!selectMode) enterSelectMode(f.hash);
          }}
          delayLongPress={500}
          activeOpacity={0.7}
          className={`bg-surface-card rounded-xl p-3 flex-row items-center gap-3 border ${
            isSelected ? "border-primary shadow-sm" : "border-secondary-light"
          }`}
        >
          {/* Checkbox in select mode */}
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

          {/* File icon */}
          <View className="w-10 h-10 rounded-lg bg-primary/10 items-center justify-center">
            <Ionicons name={icon} size={20} color={ACCENT} />
          </View>

          {/* File info */}
          <View className="flex-1 min-w-0">
            <Text
              className="text-sm font-medium text-text-primary truncate"
              numberOfLines={1}
            >
              {f.file_name || f.hash.slice(0, 20)}
            </Text>
            <View className="flex-row items-center gap-2">
              <Text className="text-[10px] font-mono text-text-secondary/40">
                {f.hash.slice(0, 16)}...
              </Text>
              <Text className="text-xs text-text-secondary/60">
                {filesize_format(f.realSize || f.size || 0)}
              </Text>
              <Text className="text-[10px] text-text-secondary/40">
                {formatTime(f.updated_at)}
              </Text>
            </View>
          </View>

          {/* Category badge */}
          <View className={`${meta.bgColor} px-2 py-0.5 rounded-full`}>
            <Text style={{ color: meta.color }} className="text-[10px]">
              {t(`storage.cat_${f.category}`)}
            </Text>
          </View>

          {/* Delete button (hidden in select mode) */}
          {!selectMode && (
            <TouchableOpacity
              onPress={() => handleDeleteFile(f)}
              className="p-1"
            >
              <Ionicons name="trash-outline" size={18} color="#ef4444" />
            </TouchableOpacity>
          )}
        </TouchableOpacity>
      );
    },
    [
      handleDeleteFile,
      selectMode,
      selectedHashes,
      toggleSelectHash,
      enterSelectMode,
      t,
    ],
  );

  const emptyState = useMemo(
    () => (
      <EmptyState
        icon="folder-open-outline"
        title={t("storage.no_files")}
        hint={
          categoryFilter !== "all"
            ? t("storage.no_category_found", { category: categoryFilter })
            : t("storage.no_cached")
        }
      />
    ),
    [categoryFilter, t],
  );

  return (
    <View className="flex-1 gap-3 bg-surface">
      {/* Title */}
      <View className="px-5 pt-6 pb-2">
        <Text className="text-3xl font-bold text-text-primary text-center">
          {t("setting.storage")}
        </Text>
      </View>

      {/* Storage Summary Card */}
      <View className="bg-surface-card rounded-2xl p-4 border border-secondary-light gap-2">
        <Text className="text-sm font-semibold text-text-primary mb-1">
          {t("storage.summary")}
        </Text>
        <View className="flex-row flex-wrap gap-x-4 gap-y-1.5">
          <View className="flex-row items-center gap-1.5">
            <Ionicons name="document-outline" size={14} color="#3b82f6" />
            <Text className="text-xs text-text-secondary">
              {t("storage.sum_bulletins")}{" "}
              <Text className="font-medium">
                {filesize_format(summary.bulletinSize)}
              </Text>
            </Text>
          </View>
          <View className="flex-row items-center gap-1.5">
            <Ionicons name="chatbubble-outline" size={14} color="#10b981" />
            <Text className="text-xs text-text-secondary">
              {t("storage.sum_chat")}{" "}
              <Text className="font-medium">
                {filesize_format(summary.chatFileSize)}
              </Text>
            </Text>
          </View>
          <View className="flex-row items-center gap-1.5">
            <Ionicons name="image-outline" size={14} color="#a855f7" />
            <Text className="text-xs text-text-secondary">
              {t("storage.sum_avatars")}{" "}
              <Text className="font-medium">
                {filesize_format(summary.avatarSize)}
              </Text>
            </Text>
          </View>
          <View className="flex-row items-center gap-1.5">
            <Ionicons name="warning-outline" size={14} color="#ef4444" />
            <Text className="text-xs text-text-secondary">
              {t("storage.sum_orphaned")}{" "}
              <Text className="font-medium">
                {filesize_format(summary.orphanedSize)}
              </Text>
            </Text>
          </View>
        </View>

        {/* Clear avatar cache button */}
        {summary.avatarSize > 0 && (
          <TouchableOpacity
            onPress={handleClearAvatars}
            className="flex-row items-center gap-2 mt-2 px-3 py-2 rounded-lg bg-status-error/10 border border-status-error/30 self-start"
          >
            <Ionicons name="trash-outline" size={14} color="#ef4444" />
            <Text className="text-xs font-medium text-status-error">
              {t("storage.clear_avatar_title")}
            </Text>
          </TouchableOpacity>
        )}
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
            {t("storage.selected_count", { count: selectedHashes.length })}
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
              {t("storage.delete_count", { count: selectedHashes.length })}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Category filter chips + select toggle */}
      <View className="flex-row bg-surface-card rounded-xl p-1 border border-secondary-light">
        {CATEGORY_CHIPS.map((chip) => {
          const isActive = categoryFilter === chip.key;
          return (
            <TouchableOpacity
              key={chip.key}
              onPress={() => handleFilterChange(chip.key)}
              className={`flex-1 py-2 rounded-lg items-center ${
                isActive ? "bg-primary/15" : ""
              }`}
            >
              <Text
                className={`text-[10px] font-medium ${
                  isActive ? "text-primary" : "text-text-secondary"
                }`}
              >
                {t(chip.labelKey)}
              </Text>
            </TouchableOpacity>
          );
        })}
        {/* Select toggle */}
        <TouchableOpacity
          onPress={() => {
            if (selectMode) exitSelectMode();
            else enterSelectMode();
          }}
          className={`py-2 px-3 rounded-lg items-center ${
            selectMode ? "bg-primary/15" : ""
          }`}
        >
          <Ionicons
            name={selectMode ? "checkmark-done" : "checkmark-circle-outline"}
            size={16}
            color={selectMode ? ACCENT : ICON_MUTED}
          />
        </TouchableOpacity>
      </View>

      {/* File list */}
      {filteredFiles.length > 0 ? (
        <FlatList
          data={filteredFiles}
          keyExtractor={(item) => item.hash}
          renderItem={renderFileItem}
          contentContainerClassName="gap-2 pb-4"
          showsVerticalScrollIndicator={false}
        />
      ) : (
        emptyState
      )}

      {/* Page indicator */}
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
          {t("storage.page_indicator", { count: page })}
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

      {/* Clear orphaned button */}
      {!selectMode && orphanedCount > 0 && (
        <TouchableOpacity
          onPress={handleClearOrphaned}
          className="border-2 border-status-error/50 py-3 rounded-xl items-center"
        >
          <View className="flex-row items-center gap-2">
            <Ionicons name="trash-outline" size={16} color="#ef4444" />
            <Text className="text-base font-semibold text-status-error">
              {t("storage.clear_orphaned_count", { count: orphanedCount })}
            </Text>
          </View>
        </TouchableOpacity>
      )}
    </View>
  );
}
