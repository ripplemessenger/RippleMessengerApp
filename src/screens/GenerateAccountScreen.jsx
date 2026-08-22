import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Clipboard, Alert } from 'react-native';

import { getWallet, generateWallet } from '../lib/RippleUtil';

export default function GenerateAccountScreen({ navigation }) {
  const [seed, setSeed] = useState('');
  const [address, setAddress] = useState('');
  const [copiedField, setCopiedField] = useState(null);

  const handleGenerate = () => {
    try {
      const gen = generateWallet();
      setSeed(gen.seed);
      // Also derive address via getWallet to ensure consistency (same pattern as desktop client)
      const wallet = getWallet(gen.seed);
      setAddress(wallet.classicAddress);
    } catch (e) {
      Alert.alert('Error', 'Failed to generate account: ' + String(e));
    }
  };

  const handleCopy = (text, label) => {
    Clipboard.setString(text);
    setCopiedField(label);
    setTimeout(() => setCopiedField(null), 1500);
  };

  return (
    <ScrollView className="flex-1 bg-surface">
      <View className="px-6 py-10 items-center">
        {/* Title */}
        <Text className="text-3xl font-bold text-text-primary mb-2">
          Generate Account
        </Text>
        <Text className="text-sm text-text-secondary mb-8 text-center">
          Create a new XRPL account
        </Text>

        {/* Divider */}
        <View className="w-full h-px bg-secondary-light mb-8" />

        {/* Form */}
        <View className="w-full max-w-sm">
          {/* Generate Button */}
          <TouchableOpacity
            onPress={handleGenerate}
            className="bg-primary py-3 rounded-xl items-center mb-6"
          >
            <Text className="text-base font-semibold text-text-primary">
              Generate Account
            </Text>
          </TouchableOpacity>

          {/* Seed Display (hidden until generated) */}
          {seed !== '' && (
            <View className="mb-4">
              <Text className="text-sm font-medium text-text-primary mb-1">
                Seed: <Text className="text-xs font-normal text-text-secondary">(tap to copy)</Text>
              </Text>
              <TouchableOpacity
                onPress={() => handleCopy(seed, 'seed')}
                activeOpacity={0.6}
                className="border border-secondary-light rounded-xl bg-surface-card px-3 py-2"
              >
                <Text className="text-xs text-text-primary font-mono break-all select-all">
                  {seed}
                </Text>
              </TouchableOpacity>
              {copiedField === 'seed' && (
                <Text className="text-xs text-status-success mt-1 font-medium">
                  Copied to clipboard!
                </Text>
              )}
            </View>
          )}

          {/* Address Display (hidden until generated) */}
          {address !== '' && (
            <View className="mb-6">
              <Text className="text-sm font-medium text-text-primary mb-1">
                Address: <Text className="text-xs font-normal text-text-secondary">(tap to copy)</Text>
              </Text>
              <TouchableOpacity
                onPress={() => handleCopy(address, 'address')}
                activeOpacity={0.6}
                className="border border-secondary-light rounded-xl bg-surface-card px-3 py-2"
              >
                <Text className="text-xs text-text-primary font-mono break-all select-all">
                  {address}
                </Text>
              </TouchableOpacity>
              {copiedField === 'address' && (
                <Text className="text-xs text-status-success mt-1 font-medium">
                  Copied to clipboard!
                </Text>
              )}
            </View>
          )}

          {/* Warning */}
          {seed !== '' && (
            <View className="p-3 rounded-xl border border-secondary/50 mb-6">
              <Text className="text-sm text-text-secondary text-center">
                Keep your seed safe. It cannot be recovered if lost.
              </Text>
            </View>
          )}

          {/* Back Button */}
          <TouchableOpacity
            onPress={() => navigation.goBack()}
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
