import { Tabs } from 'expo-router';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useState, useEffect, useCallback } from 'react';
import { Home, Plus, Search, ClipboardList, User, LucideIcon } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../lib/ThemeContext';
import { supabase } from '../../lib/supabase';
import { Spacing } from '../../constants/theme';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';

const TABS: Record<string, { icon: LucideIcon; label: string; isFab?: boolean }> = {
  index: { icon: Home, label: 'Home' },
  found: { icon: Search, label: 'Found' },
  post: { icon: Plus, label: 'Post', isFab: true },
  activity: { icon: ClipboardList, label: 'Activity' },
  profile: { icon: User, label: 'Profile' },
};

function TabBar({ state, navigation }: BottomTabBarProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [activityBadge, setActivityBadge] = useState(0);

  const safeBottom = insets.bottom > 0 ? Spacing.lg : Spacing.sm;

  const fetchBadge = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { count } = await supabase
      .from('lost_items')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .in('status', ['possible_match', 'ready_for_claiming']);

    setActivityBadge(count ?? 0);
  }, []);

  useEffect(() => { fetchBadge(); }, [fetchBadge]);

  return (
    <View
      style={[
        styles.bar,
        {
          backgroundColor: colors.tabBar,
          borderTopColor: colors.tabBarBorder,
          height: 64 + safeBottom,
          paddingBottom: safeBottom,
        },
      ]}
    >
      {state.routes.map((route, i) => {
        const tab = TABS[route.name];
        if (!tab) return null;

        const { icon: Icon, label, isFab } = tab;
        const focused = state.index === i;
        const onPress = () => {
          const e = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!focused && !e.defaultPrevented) {
            navigation.navigate(route.name);
            if (route.name === 'activity') fetchBadge();
          }
        };

        if (isFab) {
          return (
            <TouchableOpacity key={route.key} onPress={onPress} style={styles.fabWrap} activeOpacity={0.85}>
              <View
                style={[
                  styles.fab,
                  {
                    backgroundColor: colors.primary,
                    marginBottom: safeBottom > Spacing.sm ? safeBottom - Spacing.xs : 16,
                  },
                ]}
              >
                <Icon size={26} color="#FFFFFF" strokeWidth={2.5} />
              </View>
            </TouchableOpacity>
          );
        }

        const badge = route.name === 'activity' ? activityBadge : 0;

        return (
          <TouchableOpacity key={route.key} onPress={onPress} style={styles.tab} activeOpacity={0.7}>
            <View style={styles.iconWrap}>
              <Icon
                size={22}
                color={focused ? colors.primary : colors.textMuted}
                strokeWidth={focused ? 2.5 : 1.8}
              />
              {badge > 0 ? (
                <View style={[styles.badge, { backgroundColor: colors.error }]}>
                  <Text style={styles.badgeText}>{badge > 9 ? '9+' : badge}</Text>
                </View>
              ) : null}
            </View>
            <Text style={[styles.label, { color: focused ? colors.primary : colors.textMuted }]}>{label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export default function StudentLayout() {
  return (
    <Tabs tabBar={(props) => <TabBar {...props} />} screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="found" />
      <Tabs.Screen name="post" />
      <Tabs.Screen name="activity" />
      <Tabs.Screen name="profile" />
      <Tabs.Screen name="notifications" options={{ href: null }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    borderTopWidth: 1,
    paddingHorizontal: Spacing.sm,
    alignItems: 'center',
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: Spacing.sm,
    gap: 3,
  },
  iconWrap: { position: 'relative', alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 10, fontWeight: '600' },
  fabWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  fab: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#006A4E',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },
  badge: {
    position: 'absolute',
    top: -5,
    right: -8,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeText: { color: '#fff', fontSize: 8, fontWeight: '800' },
});
