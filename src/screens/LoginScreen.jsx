import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  TextInput,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useSelector, useDispatch } from "react-redux";
import { useTranslation } from "react-i18next";

import { selectOpenPageData } from "../selectors";
import { loadAccountListStart, loginStart } from "../store/slices/UserSlice";
import Logger from "../lib/Logger";
import { decryptWithPassword } from "../lib/AppUtil";
import TempLoginModal from "./TempLoginModal";

export default function LoginScreen({ navigation }) {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const { AccountList } = useSelector(selectOpenPageData);
  const [password, setPassword] = useState("");
  const [selectedAddress, setSelectedAddress] = useState("");
  const [loginError, setLoginError] = useState(null);
  const [loginLoading, setLoginLoading] = useState(false);
  const [showTempLogin, setShowTempLogin] = useState(false);

  // Load saved accounts on focus (mount + return from Generate/Import screens)
  useFocusEffect(
    React.useCallback(() => {
      dispatch(loadAccountListStart());
    }, [dispatch]),
  );

  // Auto-select first account when list loads
  useEffect(() => {
    if (AccountList.length > 0 && !selectedAddress) {
      setSelectedAddress(AccountList[0].address);
    }
  }, [AccountList]);

  const handleLogin = () => {
    const account = AccountList?.find((a) => a.address === selectedAddress);
    if (!account) return;

    setLoginLoading(true);
    try {
      const tmpSeed = decryptWithPassword(
        password,
        account.salt,
        account.cipher_data,
      );
      if (tmpSeed !== "") {
        setLoginError(null);
        Logger.info("[Login] Dispatching loginStart", {
          address: selectedAddress,
        });
        dispatch(loginStart({ seed: tmpSeed, address: selectedAddress }));
      } else {
        setLoginError(t("auth.wrong_password"));
      }
    } catch (e) {
      Logger.debug(e);
      setLoginError(typeof e === "string" ? e : String(e));
    } finally {
      setLoginLoading(false);
    }
  };

  const handleNewAccount = () => {
    navigation.navigate("GenerateAccount");
  };

  const handleImportAccount = () => {
    navigation.navigate("ImportAccount");
  };

  const handleTempLogin = ({ seed, address }) => {
    setShowTempLogin(false);
    Logger.info("[Login] Dispatching temp loginStart", { address });
    dispatch(loginStart({ seed, address, isTemp: true }));
  };

  return (
    <ScrollView className="flex-1 bg-surface">
      <View className="px-6 py-20 items-center">
        {/* App Title */}
        <Text className="text-4xl font-bold text-text-primary mb-8">
          {t("auth.app_name")}
        </Text>

        {/* Divider */}
        <View className="w-full h-px bg-secondary mb-8" />

        {/* Account List */}
        {AccountList.length > 0 ? (
          <View className="w-full max-w-sm">
            <Text className="text-lg font-semibold text-text-primary mb-3 text-center">
              {t("auth.saved_accounts")}
            </Text>

            {/* Account Picker Buttons */}
            <View className="gap-2 mb-4">
              {AccountList.map((account) => (
                <TouchableOpacity
                  key={account.address}
                  onPress={() => setSelectedAddress(account.address)}
                  className={`p-3 rounded-xl border ${
                    selectedAddress === account.address
                      ? "border-primary bg-primary-light/50"
                      : "border-secondary-light bg-surface-card"
                  }`}
                >
                  <Text className="text-sm text-text-primary font-mono text-center truncate">
                    {account.address}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Password Input */}
            <View className="mb-4">
              <Text className="text-sm font-medium text-text-primary mb-1">
                {t("auth.password_label")}
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

            {/* Login Button */}
            <TouchableOpacity
              onPress={handleLogin}
              disabled={loginLoading}
              className="bg-primary py-3 rounded-xl items-center mb-6"
            >
              <Text className="text-base font-semibold text-text-primary">
                {loginLoading ? t("auth.decrypting") : t("auth.login_saved")}
              </Text>
            </TouchableOpacity>

            {/* Error Display */}
            {loginError !== null && (
              <View className="p-3 rounded-xl border border-status-error/30 bg-status-error/5 mb-6">
                <Text className="text-sm text-status-error text-center">
                  {loginError}
                </Text>
              </View>
            )}

            {/* Divider */}
            <View className="flex-row items-center mb-6">
              <View className="flex-1 h-px bg-secondary" />
              <Text className="mx-3 text-sm text-text-secondary">
                {t("common.or")}
              </Text>
              <View className="flex-1 h-px bg-secondary" />
            </View>

            {/* New Account */}
            <TouchableOpacity
              onPress={handleNewAccount}
              className="bg-surface-card border border-secondary py-3 rounded-xl items-center mb-3"
            >
              <Text className="text-base font-medium text-text-primary">
                {t("auth.generate_new")}
              </Text>
            </TouchableOpacity>

            {/* Import Account */}
            <TouchableOpacity
              onPress={handleImportAccount}
              className="bg-surface-card border border-secondary py-3 rounded-xl items-center mb-3"
            >
              <Text className="text-base font-medium text-text-primary">
                {t("auth.import_existing")}
              </Text>
            </TouchableOpacity>

            {/* Temporary Login */}
            <TouchableOpacity
              onPress={() => setShowTempLogin(true)}
              className="bg-surface-card border border-secondary py-3 rounded-xl items-center"
            >
              <Text className="text-base font-medium text-text-primary">
                {t("common.temporary_login")}
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View className="w-full max-w-sm items-center">
            <View className="p-6 rounded-xl border border-secondary bg-surface-card mb-6">
              <Text className="text-base text-text-secondary text-center">
                {t("auth.no_saved_accounts")}
              </Text>
            </View>

            {/* New Account */}
            <TouchableOpacity
              onPress={handleNewAccount}
              className="w-full bg-primary py-3 rounded-xl items-center mb-3"
            >
              <Text className="text-base font-semibold text-text-primary">
                {t("auth.generate_new")}
              </Text>
            </TouchableOpacity>

            {/* Import Account */}
            <TouchableOpacity
              onPress={handleImportAccount}
              className="w-full bg-surface-card border border-secondary py-3 rounded-xl items-center mb-3"
            >
              <Text className="text-base font-medium text-text-primary">
                {t("auth.import_existing")}
              </Text>
            </TouchableOpacity>

            {/* Temporary Login */}
            <TouchableOpacity
              onPress={() => setShowTempLogin(true)}
              className="w-full bg-surface-card border border-secondary py-3 rounded-xl items-center"
            >
              <Text className="text-base font-medium text-text-primary">
                {t("common.temporary_login")}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Temporary Login Modal */}
        <TempLoginModal
          visible={showTempLogin}
          onClose={() => setShowTempLogin(false)}
          onLogin={handleTempLogin}
        />

        {/* Footer */}
        <Text className="mt-12 text-xs text-text-secondary">
          {t("auth.version")}
        </Text>
      </View>
    </ScrollView>
  );
}
