// Pure-JS crypto.getRandomValues polyfill (replaces react-native-get-random-values)
import { getRandomValues } from "./src/polyfills/getRandomBytes";
if (typeof global.crypto?.getRandomValues === "function") {
  // Hermes already provides it - nothing to do
} else if (global.crypto) {
  global.crypto.getRandomValues = getRandomValues;
} else {
  // @ts-expect-error - minimal polyfill; Hermes only needs getRandomValues
  global.crypto = { getRandomValues };
}
// @ts-ignore - CSS side-effect import for NativeWind
import "./src/global.css";
import i18n, { initPromise } from "./src/i18n";
import { getSettingString } from "./src/lib/SettingsUtil";
import React, { useEffect, Component, ReactNode, useState } from "react";
import { StatusBar, View, Text, StyleSheet } from "react-native";
import { I18nextProvider } from "react-i18next";

class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null; info: string }
> {
  state = { error: null as Error | null, info: "" };
  static getDerivedStateFromError(
    error: Error,
    info: { componentStack?: string },
  ) {
    return { error, info: info?.componentStack || "" };
  }
  componentDidCatch(error: Error, info: { componentStack?: string }) {
    console.error("[ERROR-BOUNDARY]", error?.message);
    console.error("[ERROR-BOUNDARY-STACK]", error?.stack);
    console.error("[ERROR-BOUNDARY-COMPONENTS]", info?.componentStack);
  }
  render() {
    if (this.state.error) {
      return (
        <View style={styles.errorBox}>
          <Text style={styles.errorTitle}>ERROR</Text>
          <Text style={styles.errorText}>{this.state.error.message}</Text>
          <Text style={styles.errorText}>{this.state.error.stack}</Text>
          <Text style={styles.errorText}>{this.state.info}</Text>
        </View>
      );
    }
    return this.props.children;
  }
}
const styles = StyleSheet.create({
  errorBox: { flex: 1, padding: 16, backgroundColor: "#1e1e26" },
  errorTitle: {
    color: "#ff4444",
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 8,
  },
  errorText: {
    color: "#ffffff",
    fontSize: 12,
    marginBottom: 8,
    fontFamily: "monospace",
  },
});
import { Provider } from "react-redux";
import { NavigationContainer } from "@react-navigation/native";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import { store } from "./src/store";
import { autoLoginInit } from "./src/store/slices/UserSlice";
import AppNavigator from "./src/navigation/AppNavigator";
import { initNotifications } from "./src/services/notificationService";
import useDarkMode from "./src/hooks/useDarkMode";

function AppShell() {
  const { isDark } = useDarkMode();
  return (
    // The `dark` class on the app root switches the CSS-variable palette
    // (see global.css) for every screen — single source of truth for theme.
    <View className={isDark ? "dark flex-1" : "flex-1"}>
      <NavigationContainer>
        <ErrorBoundary>
          <AppNavigator />
        </ErrorBoundary>
        <StatusBar
          barStyle={isDark ? "light-content" : "dark-content"}
          backgroundColor={isDark ? "#1e1e26" : "#e6b420"}
        />
      </NavigationContainer>
    </View>
  );
}

export default function App() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Wait for i18n to finish initializing before rendering any components
    initPromise
      .then(async () => {
        // Apply the user's saved language preference (defaults to "en")
        try {
          const saved = await getSettingString("language", "en");
          if (saved) await i18n.changeLanguage(saved);
        } catch {
          // keep default language
        }
        // Small delay to ensure React context is fully set up
        setTimeout(() => setReady(true), 100);
      })
      .catch(() => setReady(true));
  }, []);

  useEffect(() => {
    initNotifications();
    store.dispatch(autoLoginInit());
  }, [ready]);

  if (!ready) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <I18nextProvider i18n={i18n}>
        <Provider store={store}>
          <AppShell />
        </Provider>
      </I18nextProvider>
    </GestureHandlerRootView>
  );
}
