import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Dimensions,
  Image,
  StyleSheet,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Video from "react-native-video";
import Ionicons from "react-native-vector-icons/Ionicons";
import { useTranslation } from "react-i18next";
import { dbAPI } from "../db";
import * as fileService from "../services/fileService";
import { ACCENT } from "../lib/theme";
import { FileImageExtRegex } from "../lib/AppConst";

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");
const VIDEO_EXT_REGEX = /^\.?(mp4|mov|avi|mkv|webm)$/i;
const PAGE_SIZE = 10;

/**
 * MediaFeedScreen — TikTok-style vertical feed of bulletin media.
 *
 * Swipe up/down to browse bulletins that have image or video attachments.
 * Videos auto-play (muted) when visible; images are full-screen with pinch-zoom.
 * Bulletin metadata (author, content) overlays at the bottom.
 */
export default function MediaFeedScreen({ navigation }) {
  const { t } = useTranslation();
  const [items, setItems] = useState([]);
  const [loadedPage, setLoadedPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [totalPage, setTotalPage] = useState(1);
  const [activeIndex, setActiveIndex] = useState(0);
  const [muted, setMuted] = useState(true);
  const [bookmarkMap, setBookmarkMap] = useState({});

  // Track which video is currently visible for auto-play
  const visibleItemRef = useRef(null);

  // Load initial page
  const loadPage = useCallback(async (page, append = false) => {
    try {
      const rows = await dbAPI.getMediaFeed(page, PAGE_SIZE);
      if (append) {
        setItems((prev) => [...prev, ...rows]);
      } else {
        setItems(rows);
      }
      setLoadedPage(page);

      // Calculate total pages
      const count = await dbAPI.getMediaFeedCount();
      setTotalPage(Math.max(1, Math.ceil(count / PAGE_SIZE)));
    } catch (e) {
      console.warn("MediaFeed loadPage error:", e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadPage(1);
  }, [loadPage]);

  const handleRefresh = useCallback(() => {
    if (refreshing) return;
    setRefreshing(true);
    setLoadedPage(0);
    loadPage(1);
  }, [refreshing, loadPage]);

  const handleLoadMore = useCallback(() => {
    if (loadingMore || loadedPage >= totalPage) return;
    setLoadingMore(true);
    loadPage(loadedPage + 1, true).then(() => setLoadingMore(false));
  }, [loadingMore, loadedPage, totalPage, loadPage]);

  // Track active item for video auto-play
  const onMomentumEnd = useCallback((e) => {
    const contentOffset = e.nativeEvent.contentOffset.y;
    const index = Math.round(contentOffset / SCREEN_H);
    setActiveIndex(index);
    visibleItemRef.current = index;
  }, []);

  const onLayout = useCallback((e) => {
    const contentOffset = e.nativeEvent.contentOffset?.y || 0;
    const index = Math.round(contentOffset / SCREEN_H);
    setActiveIndex(index);
    visibleItemRef.current = index;
  }, []);

  // Bookmark toggle
  const handleBookmark = useCallback(async (hash) => {
    try {
      const current = bookmarkMap[hash] || false;
      await dbAPI.toggleBulletinMark(hash, !current);
      setBookmarkMap((prev) => ({ ...prev, [hash]: !current }));
    } catch (e) {
      console.warn("Bookmark toggle error:", e);
    }
  }, [bookmarkMap]);

  // Render a single media item
  const renderItem = useCallback(({ item, index }) => {
    const isVideo = VIDEO_EXT_REGEX.test(item.file_ext || "");
    const isImage = FileImageExtRegex.test(item.file_ext || "");
    const isActive = index === activeIndex;
    const fileUri = fileService.getFileFullPath(item.file_hash);
    const uri = fileUri.startsWith("file://") ? fileUri : `file://${fileUri}`;
    const isMarked = bookmarkMap[item.hash] || item.is_marked;

    return (
      <View style={styles.itemContainer}>
        {/* Media content */}
        {isVideo && item.file_saved ? (
          <Video
            source={{ uri }}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
            paused={!isActive}
            muted={muted}
            repeat
            progressUpdateInterval={0}
            onEnd={() => {}}
          />
        ) : isImage && item.file_saved ? (
          <Image
            source={{ uri }}
            style={StyleSheet.absoluteFill}
            resizeMode="contain"
          />
        ) : (
          <View style={styles.placeholder}>
            <Ionicons
              name={isVideo ? "videocam-outline" : "image-outline"}
              size={48}
              color="#666"
            />
            <Text style={styles.placeholderText}>
              {item.file_saved
                ? t("media_feed.not_supported")
                : t("media_feed.not_downloaded")}
            </Text>
          </View>
        )}

        {/* Bottom gradient overlay */}
        <View style={styles.gradientOverlay} pointerEvents="none">
          <View style={styles.gradient} />
        </View>

        {/* Metadata overlay */}
        <View style={styles.metaOverlay} pointerEvents="box-none">
          <View style={styles.metaLeft}>
            <Text style={styles.authorText} numberOfLines={1}>
              {item.address}
            </Text>
            {item.content ? (
              <Text style={styles.contentText} numberOfLines={3}>
                {item.content}
              </Text>
            ) : null}
          </View>

          {/* Right action buttons */}
          <View style={styles.actionCol}>
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={() => handleBookmark(item.hash)}
              activeOpacity={0.7}
            >
              <Ionicons
                name={isMarked ? "bookmark" : "bookmark-outline"}
                size={28}
                color={isMarked ? ACCENT : "#fff"}
              />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={() => setMuted(!muted)}
              activeOpacity={0.7}
            >
              <Ionicons
                name={muted ? "volume-mute-outline" : "volume-high-outline"}
                size={28}
                color="#fff"
              />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }, [activeIndex, muted, bookmarkMap, t, handleBookmark]);

  const keyExtractor = useCallback((item) => `${item.hash}_${item.file_hash}`, []);

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
          style={styles.headerBtn}
        >
          <Ionicons name="close" size={26} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t("media_feed.title")}</Text>
        <View style={styles.headerBtn} />
      </View>

      {/* Feed */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={ACCENT} />
        </View>
      ) : (
        <FlatList
          data={items}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          pagingEnabled
          showsVerticalScrollIndicator={false}
          onMomentumScrollEnd={onMomentumEnd}
          onScroll={onLayout}
          scrollEventThrottle={16}
          getItemLayout={(_data, index) => ({
            length: SCREEN_H,
            offset: SCREEN_H * index,
            index,
          })}
          windowSize={5}
          initialNumToRender={3}
          maxToRenderPerBatch={2}
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.5}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={ACCENT}
              colors={[ACCENT]}
              progressBackgroundColor="#fff"
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="images-outline" size={64} color="#555" />
              <Text style={styles.emptyText}>{t("media_feed.empty")}</Text>
            </View>
          }
          ListFooterComponent={
            loadingMore ? (
              <View style={styles.footerLoading}>
                <ActivityIndicator size="small" color={ACCENT} />
              </View>
            ) : null
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#000",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  headerBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.1)",
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
  },
  itemContainer: {
    width: SCREEN_W,
    height: SCREEN_H,
    backgroundColor: "#000",
    position: "relative",
  },
  placeholder: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#111",
  },
  placeholderText: {
    color: "#888",
    fontSize: 14,
    marginTop: 12,
  },
  gradientOverlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 200,
  },
  gradient: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  metaOverlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 16,
    paddingBottom: 24,
    paddingTop: 8,
  },
  metaLeft: {
    flex: 1,
    marginRight: 12,
  },
  authorText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#fff",
    marginBottom: 4,
  },
  contentText: {
    fontSize: 13,
    color: "rgba(255,255,255,0.85)",
    lineHeight: 18,
  },
  actionCol: {
    flexDirection: "column",
    alignItems: "center",
    gap: 16,
  },
  actionBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.12)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 8,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  emptyText: {
    color: "#888",
    fontSize: 15,
    marginTop: 12,
  },
  footerLoading: {
    paddingVertical: 16,
    alignItems: "center",
  },
});
