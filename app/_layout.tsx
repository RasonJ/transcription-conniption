// template
import { ScrollAnchorProvider } from "@/context/ScrollAnchorContext";
import { ScriptoriumProvider } from "@/context/ScriptoriumContext";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

function RootLayoutNav() {
  return (
    <Stack screenOptions={{ headerBackTitle: "Back" }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen
        name="modal"
        options={{ presentation: "modal", title: "Validation", headerShown: false }}
      />
    </Stack>
  );
}

export default function RootLayout() {
  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <ScrollAnchorProvider>
          <ScriptoriumProvider>
            <RootLayoutNav />
          </ScriptoriumProvider>
        </ScrollAnchorProvider>
      </GestureHandlerRootView>
    </QueryClientProvider>
  );
}
