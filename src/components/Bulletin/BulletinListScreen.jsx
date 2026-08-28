import React, { useCallback, useEffect, useRef, useState } from "react";
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

import BulletinCard from "./BulletinCard";
import EmptyState from "../common/EmptyState";
import ListFooter from "../common/ListFooter";
import { selectMessengerConnStatus } from "../../selectors";
import { ACCENT, ICON_MUTED } from "../../lib/theme";

/**
 * BulletinListScreen — generic paginated/flat bulletin list.
 *
 * Replaces 5 near-identical screens (Tag / Bookmark / Followed / Random /
 * Address) that each carried their own copy of the Redux→local page
 * accumulation, pull-to-refresh debounce, load-more math, header, empty
 * state and footer. The only per-list differences are now config props.
 *
 * Config props:
 *   selector     - (state) => {list, page, totalPage} (paginated) or (state) => list (flat)
 *   loadAction   - (payload) => action creator
 *   loadParams   - extra params merged into the load payload (e.g. {tag} / {address})
 *   paginated    - false for flat lists (Random)
 *   requireConn  - only load when connected (Random)
 *   guardParam   - name of a loadParam that must be truthy before loading (tag/address)
 *   icon         - Ionicons name for the header
 *   title        - header title string
 *   navTitle     - navigation bar title (defaults to title)
 *   headerExtra  - optional node rendered under the title (e.g. mono address)
 *   countText    - (count) => string
 *   emptyIcon    - Ionicons name for the empty state
 *   emptyTitle   - empty state title
 *   emptyHint    - empty state hint (string or (ctx) => string)
 */
export default function BulletinListScreen({
  navigation,
  selector,
  loadAction,
  loadParams = {},
  paginated = true,
  requireConn = false,
  guardParam = null,
  icon,
  title,
  navTitle,
  headerExtra,
  countText,
  emptyIcon,
  emptyTitle,
  emptyHint,
}) {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const isConnected = useSelector(selectMessengerConnStatus);

  const reduxState = useSelector(selector);
  // Paginated selectors return {list, page, totalPage}; flat ones return a list.
  const bulletins = paginated ? (reduxState?.list ?? []) : (reduxState ?? []);
  const page = paginated ? (reduxState?.page ?? 0) : 1;
  const totalPage = paginated ? (reduxState?.totalPage ?? 0) : 0;

  // Locally accumulated bulletin list across pages
  const [allBulletins, setAllBulletins] = useState([]);
  const [localPage, setLocalPage] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const guardOk = !guardParam || loadParams[guardParam];

  // Load initial page when component mounts
  useEffect(() => {
    if (!guardOk) return;
    if (requireConn && !isConnected) return;
    dispatch(loadAction({ ...(paginated ? { page: 1 } : {}), ...loadParams }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch, isConnected, guardOk]);

  // Sync Redux data into local state whenever Redux updates
  useEffect(() => {
    if (!paginated) {
      setAllBulletins(bulletins);
      return;
    }
    if (page === 1 && bulletins.length >= 0) {
      setAllBulletins(bulletins);
      setLocalPage(1);
    } else if (page > 1 && bulletins.length > 0) {
      setAllBulletins((prev) => [...prev, ...bulletins]);
      setLocalPage(page);
    }
  }, [bulletins, page, paginated]);

  const handleRefresh = useCallback(() => {
    if (refreshing || !guardOk) return;
    setRefreshing(true);
    setLocalPage(0);
    dispatch(loadAction({ ...(paginated ? { page: 1 } : {}), ...loadParams }));
    setTimeout(() => {
      setRefreshing(false);
    }, 3000);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch, guardOk]);

  const handleLoadMore = useCallback(() => {
    if (!paginated || !guardOk) return;
    const nextPage = localPage >= page ? page + 1 : localPage + 1;
    if (nextPage <= totalPage) {
      dispatch(loadAction({ page: nextPage, ...loadParams }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch, guardOk, localPage, page, totalPage]);

  const handlePressBulletin = useCallback(
    (bulletin) => {
      // BulletinDetail is in the BulletinTab sub-stack; these screens are
      // direct children of RootStack, so navigate() through MainTabs.
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
    (tag) => {
      navigation.navigate("TagBulletins", { tag });
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

  const hasMore = paginated && (page < totalPage || localPage < totalPage);

  const hint =
    typeof emptyHint === "function" ? emptyHint({ t, isConnected }) : emptyHint;

  return (
    <View className="flex-1 bg-surface">
      {/* Header */}
      <View className="px-4 py-3 bg-primary/5 border-b border-secondary-light/30">
        <View className="flex-row items-center gap-2">
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            activeOpacity={0.6}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="arrow-back" size={22} color={ICON_MUTED} />
          </TouchableOpacity>
          <Ionicons name={icon} size={20} color={ACCENT} />
          <Text
            className="text-lg font-bold text-text-primary flex-1"
            numberOfLines={1}
          >
            {title}
          </Text>
        </View>
        {headerExtra}
        <Text className="text-xs text-text-secondary/70 mt-1">
          {countText(allBulletins.length)}
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
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={ACCENT}
          />
        }
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.3}
        ListEmptyComponent={
          <EmptyState icon={emptyIcon} title={emptyTitle} hint={hint} />
        }
        ListFooterComponent={<ListFooter loading={hasMore} />}
      />
    </View>
  );
}
