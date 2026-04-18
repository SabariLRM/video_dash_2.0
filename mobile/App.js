/**
 * HUB 2.0 Mobile — Root App & Navigation
 *
 * Auth flow:
 *  - Not logged in → Auth stack (Login / Register)
 *  - Logged in → Main tab navigator (Home / Upload / Profile)
 *
 * Uses React Navigation v6 with native stack and bottom tabs.
 */
import React, { useEffect } from 'react'
import { StatusBar, View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { NavigationContainer } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { GestureHandlerRootView } from 'react-native-gesture-handler'

import { useAuthStore } from './src/store/authStore'
import { Colors, Typography, FontWeight, Spacing } from './src/theme/tokens'

// Screens
import LoginScreen    from './src/screens/LoginScreen'
import RegisterScreen from './src/screens/RegisterScreen'
import HomeScreen     from './src/screens/HomeScreen'
import WatchScreen    from './src/screens/WatchScreen'
import UploadScreen   from './src/screens/UploadScreen'

const Stack = createNativeStackNavigator()
const Tab   = createBottomTabNavigator()

// ---------------------------------------------------------------------------
// Profile tab (simple screen, no separate file needed)
// ---------------------------------------------------------------------------
function ProfileScreen({ navigation }) {
  const { user, logout } = useAuthStore()
  return (
    <View style={profileStyles.container}>
      <View style={profileStyles.avatar}>
        <Text style={profileStyles.avatarText}>
          {(user?.displayName || user?.username || '?').charAt(0).toUpperCase()}
        </Text>
      </View>
      <Text style={profileStyles.name}>{user?.displayName || user?.username}</Text>
      <Text style={profileStyles.handle}>@{user?.username}</Text>
      <Text style={profileStyles.email}>{user?.email}</Text>

      <TouchableOpacity style={profileStyles.logoutBtn} onPress={logout} activeOpacity={0.8}>
        <Text style={profileStyles.logoutText}>Sign out</Text>
      </TouchableOpacity>
    </View>
  )
}

const profileStyles = StyleSheet.create({
  container: {
    flex: 1, backgroundColor: Colors.bgBase,
    alignItems: 'center', justifyContent: 'center', gap: Spacing.md,
    padding: Spacing.xl,
  },
  avatar: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center',
    shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.6, shadowRadius: 12, elevation: 8,
  },
  avatarText: { color: '#fff', fontSize: 32, fontWeight: FontWeight.bold },
  name:   { color: Colors.textPrimary, fontSize: Typography['2xl'], fontWeight: FontWeight.bold },
  handle: { color: Colors.textMuted, fontSize: Typography.base },
  email:  { color: Colors.textSecondary, fontSize: Typography.sm },
  logoutBtn: {
    marginTop: Spacing.lg,
    backgroundColor: Colors.bgElevated,
    borderRadius: 12,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  logoutText: { color: Colors.textSecondary, fontWeight: FontWeight.semi },
})

// ---------------------------------------------------------------------------
// Main Tab Navigator (authenticated users)
// ---------------------------------------------------------------------------
function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerStyle:    { backgroundColor: Colors.bgSurface },
        headerTintColor: Colors.textPrimary,
        headerTitleStyle: { fontWeight: FontWeight.bold, fontSize: Typography.lg },
        tabBarStyle: {
          backgroundColor: Colors.bgSurface,
          borderTopColor: Colors.borderSubtle,
          borderTopWidth: 1,
          height: 60,
          paddingBottom: 8,
        },
        tabBarActiveTintColor:   Colors.primaryLight,
        tabBarInactiveTintColor: Colors.textMuted,
        tabBarLabelStyle: { fontSize: Typography.xs, fontWeight: FontWeight.medium },
        tabBarIcon: ({ focused, color }) => {
          const icons = { Home: '🏠', Upload: '⬆', Profile: '👤' }
          return (
            <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.5 }}>
              {icons[route.name]}
            </Text>
          )
        },
      })}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{ title: 'HUB 2.0', tabBarLabel: 'Discover' }}
      />
      <Tab.Screen
        name="Upload"
        component={UploadScreen}
        options={{ title: 'Upload', tabBarLabel: 'Upload' }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{ title: 'Profile', tabBarLabel: 'Profile' }}
      />
    </Tab.Navigator>
  )
}

// ---------------------------------------------------------------------------
// Auth Stack (unauthenticated)
// ---------------------------------------------------------------------------
function AuthStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, animation: 'fade' }}>
      <Stack.Screen name="Login"    component={LoginScreen} />
      <Stack.Screen name="Register" component={RegisterScreen} />
    </Stack.Navigator>
  )
}

// ---------------------------------------------------------------------------
// App-level Stack (includes Watch screen above tab bar)
// ---------------------------------------------------------------------------
function AppStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle:    { backgroundColor: Colors.bgSurface },
        headerTintColor: Colors.textPrimary,
        headerTitleStyle: { fontWeight: FontWeight.bold },
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="Main" component={MainTabs} options={{ headerShown: false }} />
      <Stack.Screen
        name="Watch"
        component={WatchScreen}
        options={({ route }) => ({
          title: route.params?.title || 'Watch',
          headerTransparent: false,
        })}
      />
    </Stack.Navigator>
  )
}

// ---------------------------------------------------------------------------
// Root App
// ---------------------------------------------------------------------------
export default function App() {
  const { isAuthenticated, hydrate, loading } = useAuthStore()

  useEffect(() => { hydrate() }, [])

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: Colors.bgBase, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: Colors.primaryLight, fontSize: 48 }}>▶</Text>
        <Text style={{ color: Colors.primary, marginTop: 12, fontWeight: FontWeight.bold, fontSize: Typography.lg }}>
          HUB 2.0
        </Text>
      </View>
    )
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar barStyle="light-content" backgroundColor={Colors.bgBase} />
        <NavigationContainer
          theme={{
            dark: true,
            colors: {
              primary:    Colors.primary,
              background: Colors.bgBase,
              card:       Colors.bgSurface,
              text:       Colors.textPrimary,
              border:     Colors.borderSubtle,
              notification: Colors.primary,
            },
          }}
        >
          {isAuthenticated() ? <AppStack /> : <AuthStack />}
        </NavigationContainer>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}
