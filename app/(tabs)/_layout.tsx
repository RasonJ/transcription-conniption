import { Tabs } from "expo-router";
import { BookMarked, BookOpen, ScrollText } from "lucide-react-native";
import React from "react";

export default function TabLayout() {
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
          title: "Studio",
          tabBarIcon: ({ color }) => <BookOpen color={color} size={22} />,
        }}
      />
      <Tabs.Screen
        name="library"
        options={{
          title: "Library",
          tabBarIcon: ({ color }) => <BookMarked color={color} size={22} />,
        }}
      />
      <Tabs.Screen
        name="about"
        options={{
          title: "Sources",
          tabBarIcon: ({ color }) => <ScrollText color={color} size={22} />,
        }}
      />
    </Tabs>
  );
}
