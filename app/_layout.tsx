// template
import { I18nProvider } from "@/i18n/runtime";
import { ScrollAnchorProvider } from "@/context/ScrollAnchorContext";
import { ScriptoriumProvider } from "@/context/ScriptoriumContext";
import { registerServiceWorker } from "@/utils/registerServiceWorker";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useFonts } from "expo-font";
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
  // Junicode (OFL) — MUFI v4-tracking face for PUA / medieval graphemes.
  // Andron Scriptor (MUFI font 53) may be dropped in as AndronScriptorWeb.ttf later.
  const [fontsLoaded] = useFonts({
    Junicode: require("../assets/mufi/fonts/Junicode-Regular.ttf"),
    JunicodeItalic: require("../assets/mufi/fonts/Junicode-Italic.ttf"),
  });

  useEffect(() => {
    if (!fontsLoaded) return;
    SplashScreen.hideAsync();
    registerServiceWorker();
  }, [fontsLoaded]);

  if (!fontsLoaded) return null;

  return (
    <I18nProvider>
      <QueryClientProvider client={queryClient}>
        <GestureHandlerRootView style={{ flex: 1 }}>
          <ScrollAnchorProvider>
            <ScriptoriumProvider>
              <RootLayoutNav />
            </ScriptoriumProvider>
          </ScrollAnchorProvider>
        </GestureHandlerRootView>
      </QueryClientProvider>
    </I18nProvider>
  );
}
