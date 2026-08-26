import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Alert,
  Modal,
  TextInput,
  Switch,
} from "react-native";
import { useSelector, useDispatch } from "react-redux";
import { useTranslation } from "react-i18next";
import Ionicons from "react-native-vector-icons/Ionicons";
import { ACCENT } from "../lib/theme";

import { selectServerNetworkData } from "../selectors";
import {
  ServerAdd,
  ServerDel,
  ServerSetDefault,
  ServerToggle,
} from "../store/sagas/messenger.actions";

/**
 * ServerManagementTab — manage WebSocket servers: add, delete, toggle
 * connect/disconnect, and set the default server.
 * Extracted from SettingScreen so it can be a standalone full-screen route.
 */
export default function ServerManagementTab({ navigation }) {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const { ServerList, ConnsStatus } = useSelector(selectServerNetworkData);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newUrl, setNewUrl] = useState("");

  const isOnline = (serverUrl) => ConnsStatus?.[serverUrl] === WebSocket.OPEN;

  const maxPriority =
    ServerList.length > 0
      ? Math.max(...ServerList.map((s) => s.priority || 0))
      : 0;

  const handleAdd = useCallback(() => {
    const trimmed = newUrl.trim();
    if (!trimmed) return;
    dispatch(ServerAdd({ url: trimmed }));
    setNewUrl("");
    setShowAddModal(false);
  }, [dispatch, newUrl]);

  const handleToggle = useCallback(
    (url, isConnect) => {
      dispatch(ServerToggle({ url, is_connect: isConnect }));
    },
    [dispatch],
  );

  const handleSetDefault = useCallback(
    (url) => {
      dispatch(ServerSetDefault({ url }));
    },
    [dispatch],
  );

  const handleDelete = useCallback(
    (url) => {
      Alert.alert("Delete Server", `Are you sure you want to remove ${url}?`, [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => dispatch(ServerDel({ url })),
        },
      ]);
    },
    [dispatch],
  );

  return (
    <View className="flex-1 gap-4 bg-surface">
      {/* Add button */}
      <View className="bg-surface-card rounded-2xl p-5 border border-secondary-light items-center">
        <TouchableOpacity
          onPress={() => setShowAddModal(true)}
          activeOpacity={0.7}
          className="flex-row items-center gap-1.5 bg-primary/10 border border-primary/30 px-4 py-2 rounded-lg"
        >
          <Ionicons name="add" size={16} color={ACCENT} />
          <Text className="text-sm font-medium text-primary">
            {t("common.add_server")}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Server list with management controls */}
      {ServerList.length > 0 ? (
        <ScrollView showsVerticalScrollIndicator={false}>
          <View className="gap-3">
            {ServerList.map((server) => {
              const online = isOnline(server.url);
              const isDefault = server.priority === maxPriority;
              return (
                <View
                  key={server.url}
                  className="bg-surface-card rounded-xl p-4 border border-secondary-light gap-3"
                >
                  <View className="flex-row items-center gap-3">
                    <View
                      className={`w-2.5 h-2.5 rounded-full ${
                        online ? "bg-status-success" : "bg-status-error"
                      }`}
                    />
                    <View className="flex-1 min-w-0">
                      <Text className="text-sm font-mono text-text-primary truncate">
                        {server.url}
                      </Text>
                      <Text className="text-xs text-text-secondary/70">
                        {online ? t("server.online") : t("server.offline")}
                        {isDefault ? ` • ${t("server.default")}` : ""}
                      </Text>
                    </View>
                  </View>

                  <View className="flex-row items-center justify-between">
                    <TouchableOpacity
                      onPress={() =>
                        handleToggle(server.url, !server.is_connect)
                      }
                      activeOpacity={0.7}
                      className="flex-row items-center gap-2"
                    >
                      <Switch
                        value={server.is_connect}
                        onValueChange={() =>
                          handleToggle(server.url, !server.is_connect)
                        }
                        trackColor={{ false: "#555", true: ACCENT }}
                        thumbColor={server.is_connect ? "#fff" : "#ccc"}
                      />
                      <Text className="text-xs text-text-secondary">
                        {server.is_connect
                          ? t("common.connected")
                          : t("common.disconnected")}
                      </Text>
                    </TouchableOpacity>

                    <View className="flex-row items-center gap-2">
                      <TouchableOpacity
                        onPress={() =>
                          navigation.navigate("ServerAddress", {
                            url: server.url,
                          })
                        }
                        activeOpacity={0.7}
                        className="px-3 py-1.5 rounded-lg border border-primary/30"
                      >
                        <Text className="text-xs text-primary font-medium">
                          {t("ui.view")}
                        </Text>
                      </TouchableOpacity>
                      {!isDefault && (
                        <TouchableOpacity
                          onPress={() => handleSetDefault(server.url)}
                          activeOpacity={0.7}
                          className="px-3 py-1.5 rounded-lg border border-primary/30"
                        >
                          <Text className="text-xs text-primary font-medium">
                            {t("ui.set_default")}
                          </Text>
                        </TouchableOpacity>
                      )}
                      {!server.is_connect && (
                        <TouchableOpacity
                          onPress={() => handleDelete(server.url)}
                          activeOpacity={0.7}
                          className="px-3 py-1.5 rounded-lg bg-status-error/10"
                        >
                          <Text className="text-xs text-status-error font-medium">
                            {t("common.delete")}
                          </Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        </ScrollView>
      ) : (
        <View className="flex-1 items-center justify-center gap-3">
          <Ionicons
            name="earth-outline"
            size={48}
            color={ACCENT}
            opacity={0.4}
          />
          <Text className="text-lg text-text-secondary">
            {t("ui.no_servers")}
          </Text>
          <Text className="text-sm text-text-secondary/60 text-center px-8">
            {t("ui.add_server_hint")}
          </Text>
        </View>
      )}

      {/* Add Server Modal */}
      <Modal
        visible={showAddModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowAddModal(false)}
      >
        <View className="flex-1 justify-center items-center bg-black/50 px-6">
          <View className="bg-surface-card rounded-2xl p-6 w-full gap-4 border border-secondary-light">
            <Text className="text-xl font-semibold text-text-primary text-center">
              {t("common.add_server")}
            </Text>
            <View className="gap-1">
              <Text className="text-sm text-text-secondary">
                {t("ui.websocket_url")}
              </Text>
              <TextInput
                value={newUrl}
                onChangeText={setNewUrl}
                placeholder="wss://example.com"
                placeholderTextColor="#9a9590"
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                className="bg-surface border border-secondary-light rounded-xl px-4 py-3 text-text-primary text-sm font-mono"
              />
            </View>
            <View className="flex-row gap-3 mt-2">
              <TouchableOpacity
                onPress={() => setShowAddModal(false)}
                activeOpacity={0.7}
                className="flex-1 py-3 rounded-xl border border-secondary-light items-center"
              >
                <Text className="text-base font-medium text-text-secondary">
                  Cancel
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleAdd}
                disabled={!newUrl.trim()}
                activeOpacity={0.7}
                className={`flex-1 py-3 rounded-xl items-center ${
                  newUrl.trim() ? "bg-primary" : "bg-primary/20"
                }`}
              >
                <Text
                  className={`text-base font-semibold ${
                    newUrl.trim()
                      ? "text-text-primary"
                      : "text-text-secondary/50"
                  }`}
                >
                  Add
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
