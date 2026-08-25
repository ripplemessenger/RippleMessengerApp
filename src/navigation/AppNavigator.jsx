import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { useSelector } from "react-redux";
import Ionicons from "react-native-vector-icons/Ionicons";

import { selectIsAuth } from "../selectors";
import ForwardModal from "../components/Bulletin/ForwardModal";
import FlashNotice from "../components/FlashNotice";

// Screen imports
import LoginScreen from "../screens/LoginScreen";
import GenerateAccountScreen from "../screens/GenerateAccountScreen";
import ImportAccountScreen from "../screens/ImportAccountScreen";
import BulletinScreen from "../screens/BulletinScreen";
import BulletinDetailScreen from "../screens/BulletinDetailScreen";
import TagBulletinsScreen from "../screens/TagBulletinsScreen";
import BookmarkBulletinsScreen from "../screens/BookmarkBulletinsScreen";
import ChatScreen from "../screens/ChatScreen";
import ChatDetailScreen from "../screens/ChatDetailScreen";
import ContactScreen from "../screens/ContactScreen";
import SettingScreen from "../screens/SettingScreen";
import AboutScreen from "../screens/AboutScreen";
import BulletinManagementTab from "../components/BulletinManagementTab";
import StorageManagementTab from "../components/StorageManagementTab";
import GroupManagementTab from "../components/GroupManagementTab";
import ServerManagementTab from "../components/ServerManagementTab";
import ServerAddressScreen from "../screens/ServerAddressScreen";
import FollowedBulletinsScreen from "../screens/FollowedBulletinsScreen";
import RandomBulletinsScreen from "../screens/RandomBulletinsScreen";
import AddressBulletinsScreen from "../screens/AddressBulletinsScreen";
import { ACCENT } from "../lib/theme";

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function AuthStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen
        name="GenerateAccount"
        component={GenerateAccountScreen}
        options={{ presentation: "card", title: "Generate Account" }}
      />
      <Stack.Screen
        name="ImportAccount"
        component={ImportAccountScreen}
        options={{ presentation: "card", title: "Import Account" }}
      />
    </Stack.Navigator>
  );
}

function BulletinTab() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="BulletinList" component={BulletinScreen} />
      <Stack.Screen
        name="BulletinDetail"
        component={BulletinDetailScreen}
        options={{ title: "Post" }}
      />
    </Stack.Navigator>
  );
}

function SettingTab() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        headerStyle: { backgroundColor: ACCENT },
        headerTintColor: "#1a1a2e",
      }}
    >
      <Stack.Screen name="Settings" component={SettingScreen} />
      <Stack.Screen
        name="BulletinManagement"
        component={BulletinManagementTab}
        options={{ headerShown: true, title: "Bulletin Cache" }}
      />
      <Stack.Screen
        name="StorageManagement"
        component={StorageManagementTab}
        options={{ headerShown: true, title: "File Storage" }}
      />
      <Stack.Screen
        name="GroupManagement"
        component={GroupManagementTab}
        options={{ headerShown: true, title: "My Groups" }}
      />
      <Stack.Screen
        name="ServerManagement"
        component={ServerManagementTab}
        options={{ headerShown: true, title: "Servers" }}
      />
      <Stack.Screen
        name="ServerAddress"
        component={ServerAddressScreen}
        options={{ headerShown: true, title: "Server Stats" }}
      />
      <Stack.Screen
        name="About"
        component={AboutScreen}
        options={{ title: "About" }}
      />
    </Stack.Navigator>
  );
}

function ChatTab() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="SessionList" component={ChatScreen} />
      <Stack.Screen
        name="ChatDetail"
        component={ChatDetailScreen}
        options={{ title: "Chat" }}
      />
    </Stack.Navigator>
  );
}

function MainTabNav() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          let iconName;
          if (route.name === "Bulletin")
            iconName = focused ? "newspaper" : "newspaper-outline";
          else if (route.name === "Chat")
            iconName = focused ? "chatbubbles" : "chatbubbles-outline";
          else if (route.name === "Contact")
            iconName = focused ? "people" : "people-outline";
          else if (route.name === "Setting")
            iconName = focused ? "settings" : "settings-outline";
          return <Ionicons name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: ACCENT,
        tabBarInactiveTintColor: "#6b6358",
        headerStyle: { backgroundColor: ACCENT },
        headerTintColor: "#1a1a2e",
      })}
    >
      <Tab.Screen
        name="Bulletin"
        component={BulletinTab}
        options={{ headerShown: false }}
      />
      <Tab.Screen
        name="Chat"
        component={ChatTab}
        options={{ headerShown: false }}
      />
      <Tab.Screen name="Contact" component={ContactScreen} />
      <Tab.Screen
        name="Setting"
        component={SettingTab}
        options={{ headerShown: false }}
      />
    </Tab.Navigator>
  );
}

// Root stack — TagBulletins and BookmarkBulletins are defined here so they're
// accessible from any tab via navigation.getParent().navigate(...).
const RootStack = createNativeStackNavigator();

function AuthenticatedNav() {
  const showForwardFlag = useSelector(
    (state) => state.Messenger.ShowForwardFlag,
  );
  return (
    <>
      <RootStack.Navigator screenOptions={{ headerShown: false }}>
        <RootStack.Screen name="MainTabs" component={MainTabNav} />
        <RootStack.Screen
          name="TagBulletins"
          component={TagBulletinsScreen}
          options={{ title: "Tag" }}
        />
        <RootStack.Screen
          name="BookmarkBulletins"
          component={BookmarkBulletinsScreen}
          options={{ title: "Bookmarks" }}
        />
        <RootStack.Screen
          name="FollowedBulletins"
          component={FollowedBulletinsScreen}
          options={{ title: "Followed Posts" }}
        />
        <RootStack.Screen
          name="RandomBulletins"
          component={RandomBulletinsScreen}
          options={{ title: "Random Posts" }}
        />
        <RootStack.Screen
          name="AddressBulletins"
          component={AddressBulletinsScreen}
          options={{ title: "Address Posts" }}
        />
      </RootStack.Navigator>

      {/* Forward bulletin modal — available from any screen */}
      <ForwardModal visible={showForwardFlag} />
    </>
  );
}

export default function AppNavigator() {
  const isAuth = useSelector(selectIsAuth);
  return (
    <>
      {isAuth ? <AuthenticatedNav /> : <AuthStack />}
      {/* Global toast — surfaces Common.FlashNoticeMessage (publish/file/forward feedback) */}
      <FlashNotice />
    </>
  );
}
