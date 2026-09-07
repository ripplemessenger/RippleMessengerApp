import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import { useTranslation } from "react-i18next";
import { useNavigation } from "@react-navigation/native";
import Ionicons from "react-native-vector-icons/Ionicons";
import { ICON_MUTED } from "../lib/theme";
import ZeroConf from "react-native-zeroconf";
import * as rippleKeypairs from "ripple-keypairs";

import {
  testConnection,
  authenticate,
  getAccountState,
  pullPrivateMessages,
  pullGroupMessages,
  pullGroups,
  pullMetadata,
  pullHandshakes,
  pushPrivateMessages,
  pushGroupMessages,
  pushGroups,
  pushMetadata,
  pushHandshakes,
  pushFile,
} from "../lib/syncClient";
import { dbAPI } from "../db";
import { store } from "../store";
import Logger from "../lib/Logger";
import { downloadFileToDisk, fileExists, readFile } from "../lib/FileUtil";

export default function SyncScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const [ip, setIp] = useState("");
  const [status, setStatus] = useState("idle");
  const [accounts, setAccounts] = useState([]);
  const [selectedAddr, setSelectedAddr] = useState("");
  const [log, setLog] = useState([]);
  const [error, setError] = useState(null);
  const [discovering, setDiscovering] = useState(true);
  const [stats, setStats] = useState(null);
  const [syncResult, setSyncResult] = useState(null);
  const zeroConfRef = useRef(null);

  const addLog = (msg) => {
    const time = new Date().toLocaleTimeString();
    setLog((prev) => [...prev, `[${time}] ${msg}`]);
  };

  // Load local data stats for deletion checklist
  useEffect(() => {
    const loadStats = async () => {
      try {
        const seed = store.getState().User.Seed;
        if (!seed) return;
        const kp = rippleKeypairs.deriveKeypair(seed);
        const addr = rippleKeypairs.deriveAddress(kp.publicKey);

        const [peers, groupHashes, contacts, friends, follows] =
          await Promise.all([
            dbAPI.getAllPrivatePeers(addr),
            dbAPI.getAllGroupHashes(addr),
            dbAPI.getAllContacts(),
            dbAPI.getAllFriends(addr),
            dbAPI.getAllFollows(addr),
          ]);

        let privateMsgCount = 0;
        for (const peer of peers) {
          const msgs = await dbAPI.getPrivateSessionRaw(addr, peer);
          privateMsgCount += msgs.length;
        }

        let groupMsgCount = 0;
        for (const hash of groupHashes) {
          const msgs = await dbAPI.getGroupSessionRaw(hash);
          groupMsgCount += msgs.length;
        }

        const files = await dbAPI.getAllFilesWithUsage();
        const privateFiles = files.filter(
          (f) => f.category === "private" && f.is_saved,
        );
        const groupFiles = files.filter(
          (f) => f.category === "group" && f.is_saved,
        );

        setStats({
          privateSessions: peers.length,
          privateMessages: privateMsgCount,
          privateFiles: privateFiles.length,
          privateFileSize: privateFiles.reduce((s, f) => s + (f.size || 0), 0),
          groupCount: groupHashes.length,
          groupMessages: groupMsgCount,
          groupFiles: groupFiles.length,
          groupFileSize: groupFiles.reduce((s, f) => s + (f.size || 0), 0),
          contacts: contacts.length,
          friends: friends.filter((f) => f.is_deleted === 0).length,
          follows: follows.filter((f) => f.is_deleted === 0).length,
        });
      } catch {}
    };
    loadStats();
  }, []);

  // mDNS auto-discovery
  useEffect(() => {
    const zeroConf = new ZeroConf();
    zeroConfRef.current = zeroConf;

    zeroConf.on("resolved", (service) => {
      if (service && service.addresses?.length > 0) {
        const host = service.addresses[0];
        setIp(host);
        setDiscovering(false);
        addLog(`Discovered Client at ${host}`);
        zeroConf.stop();
      }
    });

    zeroConf.on("found", (name) => {
      // Service found, waiting for resolved event with address
      addLog(`Found service: ${name}, resolving...`);
    });

    zeroConf.on("error", (err) => {
      addLog(`mDNS error: ${err.message}`);
      setDiscovering(false);
    });

    // Scan for _rms-sync._tcp.local.
    zeroConf.scan("rms-sync", "tcp", "local.");

    // Timeout after 5s
    const timer = setTimeout(() => {
      setDiscovering(false);
      zeroConf.stop();
    }, 5000);

    return () => {
      clearTimeout(timer);
      zeroConf.stop();
      zeroConf.removeAllListeners();
    };
  }, []);

  const handleTestConnection = async () => {
    if (!ip.trim()) return;
    setStatus("connecting");
    setError(null);
    addLog(`Testing connection to ${ip}...`);

    const result = await testConnection(ip.trim());
    if (result.ok) {
      setAccounts(result.accounts);
      addLog(`Connected! Found ${result.accounts.length} account(s)`);
      // Derive our own address from our seed (must match Client's logged-in address)
      const seed = store.getState().User.Seed;
      if (seed) {
        const kp = rippleKeypairs.deriveKeypair(seed);
        const myAddr = rippleKeypairs.deriveAddress(kp.publicKey);
        setSelectedAddr(myAddr);
        addLog(`My address: ${myAddr}`);
      }
      setStatus("idle");
    } else {
      setError(result.error);
      addLog(`Connection failed: ${result.error}`);
      setStatus("error");
    }
  };

  const handleSync = async () => {
    if (!ip.trim() || !selectedAddr) return;
    setStatus("syncing");
    setError(null);
    setSyncResult(null);
    const addr = selectedAddr;
    let savedCount = 0;

    try {
      // 1. Authenticate
      addLog(`Authenticating as ${addr}...`);
      const seed = store.getState().User.Seed;
      const authResult = await authenticate(ip.trim(), addr, seed);
      if (!authResult.ok) {
        throw new Error(`Auth failed: ${authResult.error}`);
      }
      addLog("Authenticated");

      // 2. Get Client state
      addLog("Fetching account state...");
      const stateResult = await getAccountState(ip.trim(), addr);
      if (!stateResult.ok) {
        throw new Error(`State fetch failed: ${stateResult.error}`);
      }
      const state = stateResult.state;
      addLog(`State: ${JSON.stringify(state).substring(0, 200)}`);

      // === PUSH (App → Client) ===
      addLog("=== Pushing App data to Client ===");

      // Push 1: Metadata (contacts, friends, follows) — full UPSERT with is_deleted
      try {
        const contacts = await dbAPI.getAllContacts();
        const friends = await dbAPI.getAllFriends(addr);
        const follows = await dbAPI.getAllFollows(addr);
        const metaResult = await pushMetadata(ip.trim(), addr, {
          contacts: contacts.map((c) => ({
            address: c.address,
            nickname: c.nickname,
            updated_at: c.updated_at,
          })),
          friends: friends.map((f) => ({
            remote: f.remote,
            updated_at: f.updated_at,
            is_deleted: f.is_deleted || 0,
          })),
          follows: follows.map((f) => ({
            remote: f.remote,
            updated_at: f.updated_at,
            is_deleted: f.is_deleted || 0,
          })),
        });
        if (metaResult.ok) {
          addLog(
            `Metadata pushed: ${metaResult.imported} imported, ${metaResult.skipped} skipped`,
          );
        } else {
          addLog(`Metadata push failed: ${metaResult.error}`);
        }
      } catch (e) {
        addLog(`Metadata push error: ${e.message}`);
      }

      // Push 2: Groups — full UPSERT (member/create_json must be JSON strings)
      try {
        const groups = await dbAPI.getGroups();
        const groupResult = await pushGroups(
          ip.trim(),
          addr,
          groups.map((g) => ({
            hash: g.hash,
            name: g.name,
            created_by: g.created_by,
            member:
              typeof g.member === "string"
                ? g.member
                : JSON.stringify(g.member),
            created_at: g.created_at,
            create_json:
              typeof g.create_json === "string"
                ? g.create_json
                : JSON.stringify(g.create_json),
            deleted_at: g.deleted_at || null,
            delete_json: g.delete_json
              ? typeof g.delete_json === "string"
                ? g.delete_json
                : JSON.stringify(g.delete_json)
              : null,
            is_accepted: g.is_accepted ? 1 : 0,
          })),
        );
        if (groupResult.ok) {
          addLog(
            `Groups pushed: ${groupResult.imported} imported, ${groupResult.skipped} skipped`,
          );
        } else {
          addLog(`Groups push failed: ${groupResult.error}`);
        }
      } catch (e) {
        addLog(`Groups push error: ${e.message}`);
      }

      // Push 3: Handshakes — full UPSERT
      try {
        const handshakes = await dbAPI.getMyHandshakes(addr);
        const hsResult = await pushHandshakes(ip.trim(), addr, handshakes);
        if (hsResult.ok) {
          addLog(
            `Handshakes pushed: ${hsResult.imported} imported, ${hsResult.skipped} skipped`,
          );
        } else {
          addLog(`Handshakes push failed: ${hsResult.error}`);
        }
      } catch (e) {
        addLog(`Handshakes push error: ${e.message}`);
      }

      // Push 4: Private messages — sequence boundary (INSERT OR IGNORE dedups)
      try {
        const localPeers = await dbAPI.getAllPrivatePeers(addr);
        for (const peer of localPeers) {
          const maxSeq = (state.private && state.private[peer]) || 0;
          const session = await dbAPI.getPrivateSessionRaw(addr, peer);
          const toPush = session.filter((m) => m.sequence > maxSeq);
          if (toPush.length === 0) continue;
          const msgResult = await pushPrivateMessages(
            ip.trim(),
            addr,
            peer,
            toPush,
          );
          if (msgResult.ok) {
            addLog(
              `Private msgs (${peer.substring(0, 8)}...): ${toPush.length} sent, ${msgResult.imported} imported, ${msgResult.skipped} skipped`,
            );
          } else {
            addLog(`Private msgs push failed: ${msgResult.error}`);
          }
        }
      } catch (e) {
        addLog(`Private msgs push error: ${e.message}`);
      }

      // Push 5: Group messages — sequence boundary (INSERT OR IGNORE dedups)
      try {
        const localGroups = await dbAPI.getAllGroupHashes(addr);
        for (const gh of localGroups) {
          const maxSeq = (state.groups && state.groups[gh]) || 0;
          const session = await dbAPI.getGroupSessionRaw(gh);
          const toPush = session.filter((m) => m.sequence > maxSeq);
          if (toPush.length === 0) continue;
          const msgResult = await pushGroupMessages(
            ip.trim(),
            addr,
            gh,
            toPush,
          );
          if (msgResult.ok) {
            addLog(
              `Group msgs (${gh.substring(0, 8)}...): ${toPush.length} sent, ${msgResult.imported} imported, ${msgResult.skipped} skipped`,
            );
          } else {
            addLog(`Group msgs push failed: ${msgResult.error}`);
          }
        }
      } catch (e) {
        addLog(`Group msgs push error: ${e.message}`);
      }

      // Push 6: Files — hash existence (read from disk, push to Client)
      try {
        const allFiles = await dbAPI.getAllFilesWithUsage();
        const clientFiles = state.files || [];
        const toPush = allFiles.filter(
          (f) => f.is_saved && !clientFiles.includes(f.hash),
        );
        if (toPush.length === 0) {
          addLog("No new files to push");
        }
        for (const f of toPush) {
          try {
            const data = await readFile(f.hash);
            const fileResult = await pushFile(ip.trim(), addr, f.hash, data);
            if (fileResult.ok) {
              addLog(
                `File pushed: ${f.hash.substring(0, 8)}... (${f.size} bytes)`,
              );
            } else {
              addLog(
                `File push failed: ${f.hash.substring(0, 8)}... ${fileResult.error}`,
              );
            }
          } catch (e) {
            addLog(
              `File read/push error: ${f.hash.substring(0, 8)}... ${e.message}`,
            );
          }
        }
      } catch (e) {
        addLog(`Files push error: ${e.message}`);
      }

      addLog("=== Push complete ===");

      // 3. Pull groups
      addLog("Pulling groups...");
      const groupsResult = await pullGroups(ip.trim(), addr);
      if (groupsResult.ok) {
        addLog(`Got ${groupsResult.groups.length} group(s)`);
        for (const g of groupsResult.groups) {
          try {
            await dbAPI.createGroup(
              g.hash,
              g.name,
              g.created_by,
              g.member,
              g.created_at,
              g.create_json,
              g.is_accepted,
            );
            savedCount++;
          } catch (e) {
            Logger.warn("[Sync] Failed to save group:", e.message);
          }
        }
      }

      // 4. Pull metadata (contacts, friends, follows)
      addLog("Pulling metadata...");
      const metaResult = await pullMetadata(ip.trim(), addr);
      if (metaResult.ok) {
        const meta = metaResult.metadata;
        if (meta.contacts) {
          for (const c of meta.contacts) {
            try {
              await dbAPI.addContact(
                c.address,
                c.nickname,
                c.updated_at || Date.now(),
              );
              savedCount++;
            } catch (e) {
              Logger.warn("[Sync] Failed to save contact:", e.message);
            }
          }
        }
        if (meta.friends) {
          for (const f of meta.friends) {
            try {
              await dbAPI.setFriendDeleted(
                addr,
                f.remote,
                f.is_deleted === 1,
                f.updated_at || Date.now(),
              );
              savedCount++;
            } catch (e) {
              Logger.warn("[Sync] Failed to save friend:", e.message);
            }
          }
        }
        if (meta.follows) {
          for (const fl of meta.follows) {
            try {
              await dbAPI.setFollowDeleted(
                addr,
                fl.remote,
                fl.is_deleted === 1,
                fl.updated_at || Date.now(),
              );
              savedCount++;
            } catch (e) {
              Logger.warn("[Sync] Failed to save follow:", e.message);
            }
          }
        }
        addLog(
          `Metadata: ${meta.contacts?.length || 0} contacts, ${meta.friends?.length || 0} friends, ${meta.follows?.length || 0} follows`,
        );
      }

      // 5. Pull handshakes
      addLog("Pulling handshakes...");
      const hsResult = await pullHandshakes(ip.trim(), addr);
      if (hsResult.ok) {
        addLog(`Got ${hsResult.handshakes.length} handshake(s)`);
        for (const hs of hsResult.handshakes) {
          try {
            await dbAPI.initHandshakeFromRemote(
              hs.self_address,
              hs.pair_address,
              hs.partition,
              hs.sequence,
              hs.aes_key,
              hs.private_key,
              hs.public_key,
              hs.self_json,
              hs.pair_json,
            );
            savedCount++;
          } catch (e) {
            Logger.warn("[Sync] Failed to save handshake:", e.message);
          }
        }
      }

      // 6. Pull private messages (for each peer in state)
      if (state.private) {
        const peers = Object.keys(state.private);
        for (const peer of peers) {
          const maxSeq = state.private[peer];
          addLog(
            `Pulling private messages from ${peer} (max_seq=${maxSeq})...`,
          );
          const msgResult = await pullPrivateMessages(ip.trim(), addr, peer, 0);
          if (msgResult.ok) {
            addLog(`Got ${msgResult.messages.length} message(s) from ${peer}`);
            for (const msg of msgResult.messages) {
              try {
                await dbAPI.addPrivateMessage(
                  msg.hash,
                  msg.sour,
                  msg.dest,
                  msg.sequence,
                  msg.pre_hash,
                  msg.content,
                  msg.json,
                  msg.signed_at,
                  msg.is_confirmed,
                  msg.is_marked,
                  msg.is_readed,
                  msg.is_object,
                );
                savedCount++;
              } catch (e) {
                Logger.warn("[Sync] Failed to save message:", e.message);
              }
            }
          }
        }
      }

      // 7. Pull group messages
      if (state.groups) {
        const groupHashes = Object.keys(state.groups);
        for (const gh of groupHashes) {
          const maxSeq = state.groups[gh];
          addLog(`Pulling group messages for ${gh} (max_seq=${maxSeq})...`);
          const gmsgResult = await pullGroupMessages(ip.trim(), addr, gh, 0);
          if (gmsgResult.ok) {
            addLog(`Got ${gmsgResult.messages.length} group message(s)`);
            for (const msg of gmsgResult.messages) {
              try {
                await dbAPI.addGroupMessage(
                  msg.hash,
                  msg.group_hash,
                  msg.address,
                  msg.sequence,
                  msg.pre_hash,
                  msg.content,
                  msg.json,
                  msg.signed_at,
                  msg.is_confirmed,
                  msg.is_marked,
                  msg.is_readed,
                  msg.is_object,
                );
                savedCount++;
              } catch (e) {
                Logger.warn("[Sync] Failed to save group msg:", e.message);
              }
            }
          }
        }
      }

      // 8. Pull files (streaming to disk, no JS heap)
      if (state.files && state.files.length > 0) {
        addLog(`Pulling ${state.files.length} file(s)...`);
        for (const fileHash of state.files) {
          // Skip if already downloaded
          const exists = await fileExists(fileHash);
          if (exists) {
            addLog(`Skip file ${fileHash.substring(0, 8)}... (exists)`);
            savedCount++;
            continue;
          }
          try {
            const url = `http://${ip.trim()}:52343/v1/account/${addr}/file/${fileHash}`;
            await downloadFileToDisk(url, fileHash);
            savedCount++;
            addLog(`Saved file ${fileHash.substring(0, 8)}...`);
          } catch (e) {
            Logger.warn(
              `[Sync] Failed to download file ${fileHash}:`,
              e.message,
            );
          }
        }
      }

      addLog(`Sync complete! Saved ${savedCount} item(s)`);
      setSyncResult({ ok: true, savedCount });
      setStatus("done");
    } catch (e) {
      Logger.error("[Sync] failed:", e);
      setError(e.message || String(e));
      addLog(`Error: ${e.message}`);
      setSyncResult({ ok: false, error: e.message });
      setStatus("error");
    }
  };

  return (
    <ScrollView className="flex-1 bg-surface">
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
          {t("sync.title")}
        </Text>
      </View>
      <View className="px-6 py-8">
        <Text className="text-sm text-text-secondary mb-6">
          {t("sync.desc")}
        </Text>

        {/* IP Input */}
        <View className="mb-4">
          <Text className="text-sm font-medium text-text-primary mb-1">
            {t("sync.client_ip")}
          </Text>
          {discovering && (
            <View className="flex-row items-center gap-2 mb-2">
              <ActivityIndicator size="small" color="#6366f1" />
              <Text className="text-xs text-text-secondary">
                {t("sync.discovering")}
              </Text>
            </View>
          )}
          <View className="flex-row gap-2">
            <View className="flex-1 border border-secondary-light rounded-xl bg-surface-card px-3 py-2">
              <TextInput
                value={ip}
                onChangeText={setIp}
                placeholder="192.168.1.100"
                autoCapitalize="none"
                keyboardType="numeric"
                className="text-text-primary"
              />
            </View>
            <TouchableOpacity
              onPress={handleTestConnection}
              disabled={status === "connecting" || ip === ""}
              className="bg-primary px-4 rounded-xl items-center justify-center"
            >
              {status === "connecting" ? (
                <ActivityIndicator size="small" color="#1a1a2e" />
              ) : (
                <Text className="text-sm font-semibold text-text-primary">
                  {t("sync.test")}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* Account Selector */}
        {accounts.length > 0 && (
          <View className="mb-4">
            <Text className="text-sm font-medium text-text-primary mb-1">
              {t("sync.account")}
            </Text>
            <View className="border border-secondary-light rounded-xl bg-surface-card px-3 py-2">
              <Text className="text-xs text-text-primary font-mono break-all">
                {selectedAddr}
              </Text>
            </View>
          </View>
        )}

        {/* Deletion Checklist */}
        {stats && (
          <View className="mb-6 p-4 rounded-xl border border-secondary-light bg-surface-card">
            <Text className="text-sm font-semibold text-text-primary mb-3">
              删除前备份
            </Text>
            <View className="space-y-2">
              <View className="flex-row items-center">
                <Ionicons name="chatbubble" size={16} color="#6366f1" />
                <Text className="text-xs text-text-primary ml-2 flex-1">
                  私聊消息 ({stats.privateSessions} 个会话,{" "}
                  {stats.privateMessages} 条)
                </Text>
              </View>
              <View className="flex-row items-center">
                <Ionicons name="document-attach" size={16} color="#6366f1" />
                <Text className="text-xs text-text-primary ml-2 flex-1">
                  私聊文件 ({stats.privateFiles} 个,{" "}
                  {(stats.privateFileSize / 1024 / 1024).toFixed(1)}MB)
                </Text>
              </View>
              <View className="flex-row items-center">
                <Ionicons name="people" size={16} color="#6366f1" />
                <Text className="text-xs text-text-primary ml-2 flex-1">
                  群聊消息 ({stats.groupCount} 个群, {stats.groupMessages} 条)
                </Text>
              </View>
              <View className="flex-row items-center">
                <Ionicons name="folder" size={16} color="#6366f1" />
                <Text className="text-xs text-text-primary ml-2 flex-1">
                  群聊文件 ({stats.groupFiles} 个,{" "}
                  {(stats.groupFileSize / 1024 / 1024).toFixed(1)}MB)
                </Text>
              </View>
              <View className="flex-row items-center">
                <Ionicons name="person" size={16} color="#6366f1" />
                <Text className="text-xs text-text-primary ml-2 flex-1">
                  联系人 ({stats.contacts} 个)
                </Text>
              </View>
              <View className="flex-row items-center">
                <Ionicons name="heart" size={16} color="#6366f1" />
                <Text className="text-xs text-text-primary ml-2 flex-1">
                  好友 ({stats.friends} 个)
                </Text>
              </View>
              <View className="flex-row items-center">
                <Ionicons name="bookmark" size={16} color="#6366f1" />
                <Text className="text-xs text-text-primary ml-2 flex-1">
                  关注 ({stats.follows} 个)
                </Text>
              </View>
            </View>
            <View className="mt-3 p-2 rounded-lg bg-status-error/5 border border-status-error/20">
              <Text className="text-xs text-status-error">
                ⚠ 同步完成后，删除 App 将丢失所有本地数据，不可恢复
              </Text>
            </View>
          </View>
        )}

        {/* Sync Result */}
        {syncResult && (
          <View className="mb-6 p-4 rounded-xl border border-secondary-light bg-surface-card">
            <Text className="text-sm font-semibold text-text-primary mb-2">
              同步结果
            </Text>
            <Text className="text-xs text-text-primary font-mono">
              {JSON.stringify(syncResult, null, 2)}
            </Text>
          </View>
        )}

        {/* Sync Button */}
        <TouchableOpacity
          onPress={handleSync}
          disabled={status === "syncing" || !ip || !selectedAddr}
          className="bg-primary py-3 rounded-xl items-center mb-6"
        >
          {status === "syncing" ? (
            <ActivityIndicator color="#1a1a2e" />
          ) : (
            <Text className="text-base font-semibold text-text-primary">
              {t("sync.start")}
            </Text>
          )}
        </TouchableOpacity>

        {/* Error */}
        {error !== null && (
          <View className="p-3 rounded-xl border border-status-error/30 bg-status-error/5 mb-6">
            <Text className="text-sm text-status-error">{error}</Text>
          </View>
        )}

        {/* Log */}
        {log.length > 0 && (
          <View className="bg-surface-card border border-secondary-light rounded-xl p-3">
            <Text className="text-xs font-mono text-text-secondary">
              {log.join("\n")}
            </Text>
          </View>
        )}
      </View>
    </ScrollView>
  );
}
