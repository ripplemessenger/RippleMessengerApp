import React, { useCallback, useState } from "react";
import {
  Text,
  TouchableOpacity,
  ActivityIndicator,
  View,
  TextInput,
} from "react-native";
import Ionicons from "react-native-vector-icons/Ionicons";
import { useDispatch, useSelector } from "react-redux";
import { useTranslation } from "react-i18next";

import BulletinListScreen from "../components/Bulletin/BulletinListScreen";
import AvatarImage from "../components/AvatarImage";
import { selectAddressBulletins, selectUserAddress } from "../selectors";
import {
  LoadAddressBulletin,
  FetchAddressBulletinChain,
  ContactAdd as ContactAddAction,
  ContactToggleIsFollow as ContactToggleIsFollowAction,
} from "../store/sagas/messenger.actions";
import { ACCENT, ICON_MUTED, PLACEHOLDER } from "../lib/theme";
import ModalShell from "../components/common/ModalShell";
import ConfirmButtonRow from "../components/common/ConfirmButtonRow";

/**
 * AddressBulletinsScreen — displays bulletins by a specific address.
 * Accessed via route.params.address. Thin wrapper over the shared
 * BulletinListScreen (see docs/component-analysis.md).
 *
 * Header right: "load all" button — pulls the full bulletin chain for this
 * address from the server, starting at seq1 (fills gaps + fetches new ones),
 * one BulletinRequest per sequence until the chain ends.
 */
export default function AddressBulletinsScreen({ route, navigation }) {
  const { t } = useTranslation();
  const { address } = route.params ?? {};
  const dispatch = useDispatch();
  const pulling = useSelector(
    (state) => state.Messenger.AddressBulletinPulling,
  );
  const followList = useSelector((state) => state.User.FollowList || []);
  const selfAddress = useSelector(selectUserAddress);
  const contactMap = useSelector((state) => state.User.ContactMap || {});

  const [showNicknameModal, setShowNicknameModal] = useState(false);
  const [nickname, setNickname] = useState("");

  const handleToggleFollow = useCallback(() => {
    if (!address) return;
    if (contactMap[address]) {
      // 已在联系人列表，直接切换关注
      dispatch(ContactToggleIsFollowAction({ contact_address: address }));
    } else {
      // 不在联系人列表，弹昵称输入框
      setNickname(address);
      setShowNicknameModal(true);
    }
  }, [dispatch, address, contactMap]);

  const handleConfirmNickname = useCallback(() => {
    dispatch(
      ContactAddAction({ address, nickname: nickname.trim() || address }),
    );
    dispatch(ContactToggleIsFollowAction({ contact_address: address }));
    setShowNicknameModal(false);
  }, [dispatch, address, nickname]);

  return (
    <>
      <BulletinListScreen
        navigation={navigation}
        selector={selectAddressBulletins}
        loadAction={LoadAddressBulletin}
        loadParams={{ address }}
        guardParam="address"
        icon="person"
        headerIcon={
          address ? <AvatarImage address={address} size={30} /> : null
        }
        title={t("ui.address_posts")}
        headerExtra={
          address ? (
            <Text className="text-xs font-mono text-text-secondary/50 mt-1">
              {address}
            </Text>
          ) : null
        }
        headerRight={
          address ? (
            <View className="flex-row items-center gap-1">
              {/* Follow/Unfollow（自己的地址不显示） */}
              {address !== selfAddress && (
                <TouchableOpacity
                  onPress={handleToggleFollow}
                  activeOpacity={0.6}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityLabel={
                    followList.includes(address)
                      ? t("common.following")
                      : t("common.follow")
                  }
                >
                  <Ionicons
                    name={followList.includes(address) ? "eye" : "eye-outline"}
                    size={20}
                    color={followList.includes(address) ? ACCENT : ICON_MUTED}
                  />
                </TouchableOpacity>
              )}

              {/* Load all */}
              <TouchableOpacity
                onPress={() =>
                  dispatch(
                    FetchAddressBulletinChain({
                      address,
                    }),
                  )
                }
                disabled={pulling}
                activeOpacity={0.6}
                hitSlop={{
                  top: 8,
                  bottom: 8,
                  left: 8,
                  right: 8,
                }}
                accessibilityLabel={t("ui.load_all")}
              >
                {pulling ? (
                  <ActivityIndicator size="small" color={ACCENT} />
                ) : (
                  <Ionicons
                    name="cloud-download-outline"
                    size={20}
                    color={ICON_MUTED}
                  />
                )}
              </TouchableOpacity>
            </View>
          ) : null
        }
        countText={(count) => t("ui.posts_loaded", { count })}
        emptyIcon="newspaper-outline"
        emptyTitle={t("ui.no_posts_found")}
        emptyHint={(ctx) =>
          address ? ctx.t("ui.address_no_posts") : ctx.t("ui.no_address")
        }
      />

      {/* 昵称输入弹窗（follow 时如果不在联系人列表） */}
      <ModalShell
        visible={showNicknameModal}
        onClose={() => setShowNicknameModal(false)}
        title={t("common.follow")}
      >
        <View className="gap-1">
          <Text className="text-sm text-text-secondary">
            {t("ui.nickname_optional")}
          </Text>
          <TextInput
            value={nickname}
            onChangeText={setNickname}
            placeholder={t("ui.nickname")}
            placeholderTextColor={PLACEHOLDER}
            className="bg-surface border border-secondary-light rounded-xl px-4 py-3 text-text-primary text-sm"
          />
        </View>
        <ConfirmButtonRow
          onConfirm={handleConfirmNickname}
          confirmText={t("common.follow")}
          showCancel={true}
        />
      </ModalShell>
    </>
  );
}
