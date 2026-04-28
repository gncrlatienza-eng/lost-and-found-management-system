import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, RefreshControl, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ChevronLeft, Bell, CheckCheck } from 'lucide-react-native';
import { useTheme } from '../../lib/ThemeContext';
import { supabase } from '../../lib/supabase';
import { Spacing, Radius } from '../../constants/theme';
import type { Notification } from '../../types';

const TYPE_ICON: Record<string, string> = {
  match_found: '🎯', ready_for_claiming: '✅', schedule_set: '📅',
  approved: '👍', rejected: '❌', matched: '🔗', resolved: '🎉', default: '🔔',
};

function timeAgo(date: string) {
  const diff = Date.now() - new Date(date).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'Just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function NotificationsScreen() {
  const { colors } = useTheme();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchNotifications = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from('notifications').select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    setNotifications(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchNotifications(); }, []);

  const markAllRead = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from('notifications').update({ read: true }).eq('user_id', user.id).eq('read', false);
    setNotifications(n => n.map(x => ({ ...x, read: true })));
  };

  const markRead = async (id: string) => {
    await supabase.from('notifications').update({ read: true }).eq('id', id);
    setNotifications(n => n.map(x => x.id === id ? { ...x, read: true } : x));
  };

  const onRefresh = async () => { setRefreshing(true); await fetchNotifications(); setRefreshing(false); };

  const unreadCount = notifications.filter(n => !n.read).length;

  const s = StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.background },
    header: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: Spacing.xl, paddingVertical: Spacing.lg,
      backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border,
    },
    headerLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
    headerTitle: { fontSize: 18, fontWeight: '700', color: colors.text },
    markAllBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    markAllText: { fontSize: 13, color: colors.primary, fontWeight: '600' },
    item: {
      flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md,
      paddingHorizontal: Spacing.xl, paddingVertical: Spacing.lg,
      borderBottomWidth: 1, borderBottomColor: colors.border,
    },
    iconWrap: {
      width: 44, height: 44, borderRadius: 22,
      alignItems: 'center', justifyContent: 'center',
    },
    iconText: { fontSize: 20 },
    itemContent: { flex: 1 },
    itemMessage: { fontSize: 14, color: colors.text, lineHeight: 20, marginBottom: 4 },
    itemTime: { fontSize: 12, color: colors.textMuted },
    unreadDot: {
      width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary,
      marginTop: 6,
    },
    empty: { alignItems: 'center', marginTop: 80, gap: Spacing.md },
    emptyText: { fontSize: 18, fontWeight: '700', color: colors.text },
    emptySub: { fontSize: 14, color: colors.textSecondary },
    badge: {
      backgroundColor: colors.primary, borderRadius: Radius.full,
      paddingHorizontal: 8, paddingVertical: 2, marginLeft: Spacing.sm,
    },
    badgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  });

  const renderItem = ({ item }: { item: Notification }) => {
    const icon = TYPE_ICON[item.type] || TYPE_ICON.default;
    return (
      <TouchableOpacity style={[s.item, { backgroundColor: item.read ? colors.surface : colors.primaryMuted }]} onPress={() => markRead(item.id)} activeOpacity={0.7}>
        <View style={[s.iconWrap, { backgroundColor: item.read ? colors.gray100 : colors.primarySoft }]}>
          <Text style={s.iconText}>{icon}</Text>
        </View>
        <View style={s.itemContent}>
          <Text style={[s.itemMessage, { fontWeight: item.read ? '400' : '600' }]}>{item.message}</Text>
          <Text style={s.itemTime}>{timeAgo(item.created_at)}</Text>
        </View>
        {!item.read && <View style={s.unreadDot} />}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <View style={s.headerLeft}>
          <TouchableOpacity onPress={() => router.back()}><ChevronLeft size={24} color={colors.text} /></TouchableOpacity>
          <Text style={s.headerTitle}>Notifications</Text>
          {unreadCount > 0 && <View style={s.badge}><Text style={s.badgeText}>{unreadCount}</Text></View>}
        </View>
        {unreadCount > 0 && (
          <TouchableOpacity style={s.markAllBtn} onPress={markAllRead}>
            <CheckCheck size={16} color={colors.primary} />
            <Text style={s.markAllText}>Mark all read</Text>
          </TouchableOpacity>
        )}
      </View>

      {loading ? <ActivityIndicator color={colors.primary} style={{ marginTop: 60 }} size="large" /> : (
        <FlatList
          data={notifications} keyExtractor={i => i.id} renderItem={renderItem}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 40 }}
          ListEmptyComponent={
            <View style={s.empty}>
              <Bell size={64} color={colors.border} />
              <Text style={s.emptyText}>No notifications yet</Text>
              <Text style={s.emptySub}>You'll be notified about your items here</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}