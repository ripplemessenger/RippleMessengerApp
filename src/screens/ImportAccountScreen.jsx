import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, TextInput, ActivityIndicator, Keyboard } from 'react-native';

import { getWallet } from '../lib/RippleUtil';
import { genSalt, encryptWithPassword } from '../lib/AppUtil';
import { dbAPI } from '../db';
import Logger from '../lib/Logger';

export default function ImportAccountScreen({ navigation }) {
  const [seed, setSeed] = useState('');
  const [address, setAddress] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  // Validate seed as user types - derive address if valid
  const handleSeedChange = (value) => {
    const trimmed = value.trim();
    setSeed(trimmed);
    setAddress('');
    setError(null);

    if (trimmed === '') return;

    try {
      const wallet = getWallet(trimmed);
      setAddress(wallet.classicAddress);
    } catch (e) {
      Logger.debug('[ImportAccount] invalid seed:', e);
      setError('Invalid seed format');
    }
  };

  const handleImport = async () => {
    Keyboard.dismiss();
    setError(null);

    if (!seed.trim()) {
      setError('Seed is required');
      return;
    }

    if (password.trim() === '') {
      setError('Password is required');
      return;
    }

    // Double-check seed validity
    let wallet;
    try {
      wallet = getWallet(seed);
    } catch (e) {
      setError('Invalid seed format');
      return;
    }

    setLoading(true);
    try {
      const addr = wallet.classicAddress;

      // Generate salt and encrypt seed
      const salt = genSalt();
      const cipherData = encryptWithPassword(seed, password, salt);

      // Save to database
      await dbAPI.addAccount(addr, salt, cipherData, Date.now());

      // Navigate back to LoginScreen
      navigation.goBack();
    } catch (e) {
      Logger.error('[ImportAccount] failed:', e);
      setError(typeof e === 'string' ? e : String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView className="flex-1 bg-surface">
      <View className="px-6 py-10 items-center">
        {/* Title */}
        <Text className="text-3xl font-bold text-text-primary mb-2">
          Import Account
        </Text>
        <Text className="text-sm text-text-secondary mb-8 text-center">
          Import an existing XRPL account using your seed
        </Text>

        {/* Divider */}
        <View className="w-full h-px bg-secondary-light mb-8" />

        {/* Form */}
        <View className="w-full max-w-sm">
          {/* Seed Input */}
          <View className="mb-4">
            <Text className="text-sm font-medium text-text-primary mb-1">
              Seed:
            </Text>
            <View className="border border-secondary-light rounded-xl bg-surface-card px-3 py-2">
              <TextInput
                value={seed}
                onChangeText={handleSeedChange}
                placeholder="s.................................."
                autoCapitalize="none"
                keyboardType="visible-password"
                className="text-text-primary font-mono"
              />
            </View>
          </View>

          {/* Derived Address (read-only) */}
          {address !== '' && (
            <View className="mb-4">
              <Text className="text-sm font-medium text-text-primary mb-1">
                Address:
              </Text>
              <View className="border border-secondary-light rounded-xl bg-surface-card px-3 py-2">
                <Text className="text-xs text-text-secondary font-mono break-all">
                  {address}
                </Text>
              </View>
            </View>
          )}

          {/* Password Input */}
          <View className="mb-6">
            <Text className="text-sm font-medium text-text-primary mb-1">
              Password:
            </Text>
            <View className="border border-secondary-light rounded-xl bg-surface-card px-3 py-2">
              <TextInput
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                placeholder="........"
                autoCapitalize="none"
                className="text-text-primary"
              />
            </View>
          </View>

          {/* Error Display */}
          {error !== null && (
            <View className="p-3 rounded-xl border border-status-error/30 bg-status-error/5 mb-6">
              <Text className="text-sm text-status-error text-center">
                {error}
              </Text>
            </View>
          )}

          {/* Import Button */}
          <TouchableOpacity
            onPress={handleImport}
            disabled={loading || seed === '' || password.length === 0}
            className="bg-primary py-3 rounded-xl items-center mb-4"
          >
            {loading ? (
              <ActivityIndicator color="#1a1a2e" />
            ) : (
              <Text className="text-base font-semibold text-text-primary">
                Import Account
              </Text>
            )}
          </TouchableOpacity>

          {/* Back Button */}
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            disabled={loading}
            className="bg-surface-card border border-secondary py-3 rounded-xl items-center"
          >
            <Text className="text-base font-medium text-text-secondary">
              Back to Login
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );
}
