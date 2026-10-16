import { useT } from "@/i18n/runtime";
import { Tabs } from "expo-router";
import { BookMarked, BookOpen, ScrollText } from "lucide-react-native";
import React from "react";

export default function TabLayout() {
  const t = useT();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: "#f6d890",
        tabBarInactiveTintColor: "rgba(255,244,210,0.55)",
        tabBarStyle: {
          backgroundColor: "#210d0b",
          borderTopColor: "rgba(246,216,144,0.22)",
        },
        headerShown: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t("studio.tab.studio"),
          tabBarIcon: ({ color }) => <BookOpen color={color} size={22} />,
        }}
      />
      <Tabs.Screen
        name="library"
        options={{
          title: t("studio.tab.library"),
          tabBarIcon: ({ color }) => <BookMarked color={color} size={22} />,
        }}
      />
      <Tabs.Screen
        name="about"
        options={{
          title: t("studio.tab.sources"),
          tabBarIcon: ({ color }) => <ScrollText color={color} size={22} />,
        }}
      />
    </Tabs>
  );
}
