import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useDispatch, useSelector } from 'react-redux';

import BulletinCard from '../components/Bulletin/BulletinCard';
import { selectAddressBulletins } from '../selectors';
import { LoadAddressBulletin } from '../store/sagas/messenger.actions';

/**
 * AddressBulletinsScreen — displays bulletins by a specific address.
 * Accessed via route.params.address.
 */
export default function AddressBulletinsScreen({ route, navigation }) {
  const { address: routeAddress } = route.params ?? {};
  const dispatch = useDispatch();
  const { list: bulletins, page, totalPage, address: reduxAddress } =
    useSelector(selectAddressBulletins);

  // Locally accumulated bulletin list across pages
  const [allBulletins, setAllBulletins] = useState([]);
  const [localPage, setLocalPage] = useState(0);
  const refreshingRef = useRef(false);

  // Load initial page when component mounts with a valid address
  useEffect(() => {
    if (routeAddress) {
      dispatch(LoadAddressBulletin({ address: routeAddress, page: 1 }));
    }
  }, [dispatch, routeAddress]);

  // Sync Redux data into local state whenever Redux updates
  useEffect(() => {
    if (page === 1 && bulletins.length >= 0) {
      setAllBulletins(bulletins);
      setLocalPage(1);
    } else if (page > 1 && bulletins.length > 0) {
      setAllBulletins(prev => [...prev, ...bulletins]);
      setLocalPage(page);
    }
  }, [bulletins, page]);

  // Set header with address and back button
  React.useLayoutEffect(() => {
    const displayAddr = routeAddress
      ? `${routeAddress.slice(0, 8)}...${routeAddress.slice(-6)}`
      : 'Address';
    navigation.setOptions({
      headerLeft: () => (
        <Text
          onPress={() => navigation.goBack()}
          className="text-base font-semibold text-primary"
          style={{ paddingLeft: 8 }}
        >
          ← Back
        </Text>
      ),
      title: displayAddr,
      headerStyle: { backgroundColor: '#e6b420' },
      headerTintColor: '#1a1a2e',
    });
  }, [navigation, routeAddress]);

  const handleRefresh = useCallback(() => {
    if (refreshingRef.current || !routeAddress) return;
    refreshingRef.current = true;
    setLocalPage(0);
    dispatch(LoadAddressBulletin({ address: routeAddress, page: 1 }));
    setTimeout(() => { refreshingRef.current = false; }, 3000);
  }, [dispatch, routeAddress]);

  const handleLoadMore = useCallback(() => {
    if (!routeAddress) return;
    const nextPage = localPage >= page ? page + 1 : localPage + 1;
    if (nextPage <= totalPage) {
      dispatch(LoadAddressBulletin({ address: routeAddress, page: nextPage }));
    }
  }, [dispatch, routeAddress, localPage, page, totalPage]);

  const handlePressBulletin = useCallback((bulletin) => {
    navigation.getParent()?.navigate('MainTabs', {
      screen: 'Bulletin',
      params: {
        screen: 'BulletinDetail',
        params: {
          hash: bulletin.hash,
          address: bulletin.address,
          sequence: bulletin.sequence,
        },
      },
    });
  }, [navigation]);

  const handleTagPress = useCallback((t) => {
    navigation.navigate('TagBulletins', { tag: t });
  }, [navigation]);

  const renderItem = useCallback(({ item }) => (
    <BulletinCard
      bulletin={item}
      onPress={() => handlePressBulletin(item)}
      onTagPress={handleTagPress}
    />
  ), [handlePressBulletin, handleTagPress]);

  const keyExtractor = useCallback((item) => item.hash, []);

  const hasMore = page < totalPage || localPage < totalPage;

  return (
    <View className="flex-1 bg-surface">
      {/* Header info */}
      <View className="px-4 py-3 bg-primary/5 border-b border-secondary-light/30">
        <View className="flex-row items-center gap-2">
          <Ionicons name="person" size={20} color="#e6b420" />
          <Text className="text-lg font-bold text-text-primary">
            Address Posts
          </Text>
        </View>
        {reduxAddress && (
          <Text className="text-xs font-mono text-text-secondary/50 mt-1">
            {reduxAddress}
          </Text>
        )}
        <Text className="text-xs text-text-secondary/70 mt-1">
          {allBulletins.length} post{allBulletins.length !== 1 ? 's' : ''} loaded
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
            tintColor="#e6b420"
          />
        }
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.3}
        ListEmptyComponent={
          <View className="flex-1 items-center justify-center py-20">
            <Ionicons name="document-text-outline" size={48} color="#d4c8a8" />
            <Text className="text-xl font-bold text-text-primary mt-3 mb-1">
              No posts found
            </Text>
            <Text className="text-sm text-text-secondary text-center px-8">
              {routeAddress
                ? 'This address has no posts or they have not been synced yet.'
                : 'No address specified.'}
            </Text>
          </View>
        }
        ListFooterComponent={
          hasMore ? (
            <View className="py-4 items-center">
              <ActivityIndicator size="small" color="#e6b420" />
              <Text className="text-xs text-text-secondary/70 mt-1">Loading more…</Text>
            </View>
          ) : null
        }
      />
    </View>
  );
}
