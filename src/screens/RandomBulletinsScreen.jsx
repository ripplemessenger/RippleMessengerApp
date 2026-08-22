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
import { selectRandomBulletins, selectMessengerConnStatus } from '../selectors';
import { RequestRandomBulletin } from '../store/sagas/messenger.actions';

/**
 * RandomBulletinsScreen — displays random bulletins fetched from the network.
 * Unlike paginated screens, random bulletins return a flat list without page numbers.
 */
export default function RandomBulletinsScreen({ navigation }) {
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
          ← Back
        </Text>
      ),
      title: 'Random Posts',
      headerStyle: { backgroundColor: '#e6b420' },
      headerTintColor: '#1a1a2e',
    });
  }, [navigation]);

  const handleRefresh = useCallback(() => {
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    dispatch(RequestRandomBulletin());
    setTimeout(() => { refreshingRef.current = false; }, 3000);
  }, [dispatch]);

  const handlePressBulletin = useCallback((bulletin) => {
    // This screen is a direct child of RootStack, so navigate() directly.
    navigation.navigate('MainTabs', {
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

  return (
    <View className="flex-1 bg-surface">
      {/* Header info */}
      <View className="px-4 py-3 bg-primary/5 border-b border-secondary-light/30">
        <View className="flex-row items-center gap-2">
          <Ionicons name="shuffle" size={20} color="#e6b420" />
          <Text className="text-lg font-bold text-text-primary">
            Random Posts
          </Text>
        </View>
        <View className="flex-row items-center gap-2 mt-1">
          <View
            className={`w-2 h-2 rounded-full ${
              isConnected ? 'bg-status-success' : 'bg-status-error'
            }`}
          />
          <Text className="text-xs text-text-secondary/70">
            {isConnected ? 'Connected' : 'Disconnected'}
            {' · '}
            {bulletins.length} post{bulletins.length !== 1 ? 's' : ''} loaded
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
            tintColor="#e6b420"
          />
        }
        ListEmptyComponent={
          <View className="flex-1 items-center justify-center py-20">
            <Ionicons name="shuffle-outline" size={48} color="#d4c8a8" />
            <Text className="text-xl font-bold text-text-primary mt-3 mb-1">
              No random posts yet
            </Text>
            <Text className="text-sm text-text-secondary text-center px-8">
              {isConnected
                ? 'Pull to refresh to discover random posts from the network.'
                : 'Connect to a server first to discover random posts.'}
            </Text>
          </View>
        }
      />
    </View>
  );
}
