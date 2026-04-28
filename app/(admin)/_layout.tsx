import { Tabs } from 'expo-router';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useState, useEffect, useCallback } from 'react';
import {
  LayoutDashboard, ClipboardList, GitMerge, Package,
  Archive, Settings, LucideIcon,
} from 'lucide-react-native';
import { Spacing, Radius } from '../../constants/theme';
import { supabase } from '../../lib/supabase';
import { useTheme } from '../../lib/ThemeContext';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';

const TABS: Record<string, { icon: LucideIcon; label: string }> = {
  index:         { icon: LayoutDashboard, label: 'Dashboard' },
  'found-items': { icon: ClipboardList,   label: 'Found' },
  matching:      { icon: GitMerge,        label: 'Match' },
  claims:        { icon: Package,         label: 'Claims' },
  archive:       { icon: Archive,         label: 'Archive' },
  settings:      { icon: Settings,        label: 'Settings' },
};

interface Badges {
  'found-items': number;
  matching: number;
  claims: number;
}

function AdminTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const { colors } = useTheme();
  const [badges, setBadges] = useState<Badges>({ 'found-items': 0, matching: 0, claims: 0 });

  const fetchBadges = useCallback(async () => {
    const [pending, approvedFound, pendingMatches] = await Promise.all([
      supabase.from('found_reports').select('*', { count: 'exact', head: true }).eq('status', 'pending_review'),
      supabase.from('found_reports').select('*', { count: 'exact', head: true }).eq('status', 'approved'),
      supabase.from('matches').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
    ]);
    setBadges({
      'found-items': pending.count ?? 0,
      matching: approvedFound.count ?? 0,
      claims: pendingMatches.count ?? 0,
    });
  }, []);

  useEffect(() => { fetchBadges(); }, []);

  return (
    <View style={[s.bar, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
      {state.routes.map((route, i) => {
        const tab = TABS[route.name];
        if (!tab) return null;
        const { icon: Icon, label } = tab;
        const focused = state.index === i;
        const badgeCount = (badges as any)[route.name] ?? 0;

        const onPress = () => {
          fetchBadges();
          const e = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!focused && !e.defaultPrevented) navigation.navigate(route.name);
        };

        return (
          <TouchableOpacity key={route.key} onPress={onPress} style={s.tab} activeOpacity={0.7}>
            <View style={[s.iconWrap, focused && { backgroundColor: colors.primary }]}>
              <Icon
                size={20}
                color={focused ? '#fff' : colors.gray400}
                strokeWidth={focused ? 2.5 : 1.8}
              />
              {badgeCount > 0 && (
                <View style={[s.badge, { backgroundColor: colors.error }]}>
                  <Text style={s.badgeText}>{badgeCount > 99 ? '99+' : badgeCount}</Text>
                </View>
              )}
            </View>
            <Text style={[s.label, { color: focused ? colors.primary : colors.textMuted }]}>{label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export default function AdminLayout() {
  return (
    <Tabs tabBar={props => <AdminTabBar {...props} />} screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="found-items" />
      <Tabs.Screen name="matching" />
      <Tabs.Screen name="claims" />
      <Tabs.Screen name="archive" />
      <Tabs.Screen name="settings" />
      <Tabs.Screen name="notifications" options={{ href: null }} />
    </Tabs>
  );
}

const s = StyleSheet.create({
  bar: {
    flexDirection: 'row', height: 64,
    borderTopWidth: 1,
    paddingBottom: Spacing.sm, paddingHorizontal: Spacing.xs,
    alignItems: 'center',
  },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3 },
  iconWrap: {
    width: 36, height: 36, borderRadius: Radius.md,
    alignItems: 'center', justifyContent: 'center',
    position: 'relative',
  },
  label: { fontSize: 9, fontWeight: '600' },
  badge: {
    position: 'absolute', top: -4, right: -6,
    minWidth: 16, height: 16, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeText: { color: '#fff', fontSize: 8, fontWeight: '800' },
});
