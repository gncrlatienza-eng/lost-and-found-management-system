import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, RefreshControl, ActivityIndicator, Modal, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ChevronLeft, Bell, CheckCheck, X } from 'lucide-react-native';
import { useTheme } from '../../lib/ThemeContext';
import { supabase } from '../../lib/supabase';
import { Spacing, Radius } from '../../constants/theme';
import {
  attachNotificationTarget,
  parseNotificationTarget,
  stripNotificationTarget,
  type NotificationTarget,
} from '../../lib/notificationTargets';
import type { Notification } from '../../types';

const TYPE_ICON: Record<string, string> = {
  match_found: '🎯',
  ready_for_claiming: '✅',
  schedule_set: '📅',
  approved: '👍',
  rejected: '❌',
  matched: '🔗',
  resolved: '🎉',
  found_approved: '✅',
  found_rejected: '❌',
  surrender_requested: '📦',
  item_received: '📥',
  default: '🔔',
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

const getNotificationTitle = (type: string) => {
  switch (type) {
    case 'match_found':
      return 'Possible Match Found';
    case 'ready_for_claiming':
      return 'Ready for Claiming';
    case 'resolved':
      return 'Case Resolved';
    case 'found_approved':
      return 'Found Report Approved';
    case 'found_rejected':
      return 'Found Report Rejected';
    case 'surrender_requested':
      return 'SDFO Follow-up';
    case 'item_received':
      return 'Item Received';
    default:
      return 'Notification';
  }
};

const extractQuotedText = (message: string) => {
  const cleanMessage = stripNotificationTarget(message);
  const quoted = cleanMessage.match(/"([^"]+)"/);
  if (quoted?.[1]) return quoted[1].trim();

  const lostName = cleanMessage.match(/lost item:\s(.+?)(?:\.|$)/i);
  if (lostName?.[1]) return lostName[1].trim();

  return null;
};

const extractScheduleText = (message: string) => {
  const cleanMessage = stripNotificationTarget(message);
  const schedule = cleanMessage.match(/Schedule:\s*(.+)$/i);
  return schedule?.[1]?.trim() ?? null;
};

const extractRejectionReason = (message: string) => {
  const cleanMessage = stripNotificationTarget(message);
  const reason = cleanMessage.match(/Reason:\s*(.+)$/i);
  return reason?.[1]?.trim() ?? null;
};

const canOpenRelatedReport = (type: string) => {
  return [
    'match_found',
    'ready_for_claiming',
    'resolved',
    'found_approved',
    'found_rejected',
    'surrender_requested',
    'item_received',
  ].includes(type);
};

export default function NotificationsScreen() {
  const { colors } = useTheme();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [selected, setSelected] = useState<Notification | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchNotifications = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    setNotifications(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchNotifications(); }, [fetchNotifications]);

  const markAllRead = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase.from('notifications').update({ read: true }).eq('user_id', user.id).eq('read', false);
    setNotifications((current) => current.map((item) => ({ ...item, read: true })));
  };

  const markRead = async (id: string) => {
    await supabase.from('notifications').update({ read: true }).eq('id', id);
    setNotifications((current) => current.map((item) => item.id === id ? { ...item, read: true } : item));
  };

  const openNotification = async (item: Notification) => {
    if (!item.read) await markRead(item.id);
    setSelected({ ...item, read: true });
  };

  const buildLostRoute = (id: string) => (
    { pathname: '/(student)/activity', params: { tab: 'lost', lostId: id } } as const
  );

  const buildFoundRoute = (id: string) => (
    { pathname: '/(student)/activity', params: { tab: 'found', foundId: id } } as const
  );

  const pickClosestByCreatedAt = <T extends { created_at: string }>(rows: T[], notificationDate: string) => {
    if (rows.length === 0) return null;

    const targetTime = new Date(notificationDate).getTime();
    return [...rows].sort((left, right) => {
      const leftDiff = Math.abs(targetTime - new Date(left.created_at).getTime());
      const rightDiff = Math.abs(targetTime - new Date(right.created_at).getTime());
      return leftDiff - rightDiff;
    })[0];
  };

  const persistNotificationTarget = async (notification: Notification, target: NotificationTarget) => {
    const nextMessage = attachNotificationTarget(notification.message, target);
    if (nextMessage === notification.message) return;

    await supabase.from('notifications').update({ message: nextMessage }).eq('id', notification.id);

    setNotifications((current) => current.map((item) => (
      item.id === notification.id ? { ...item, message: nextMessage } : item
    )));
    setSelected((current) => (
      current?.id === notification.id ? { ...current, message: nextMessage } : current
    ));
  };

  const resolveLostItemTarget = async (userId: string, notification: Notification): Promise<NotificationTarget | null> => {
    const itemName = extractQuotedText(notification.message);
    const schedule = extractScheduleText(notification.message);

    if (notification.type === 'ready_for_claiming' && schedule) {
      const { data: claimRows } = await supabase
        .from('claims')
        .select('match_id, schedule')
        .eq('claimant_id', userId)
        .eq('schedule', schedule);

      const matchId = claimRows?.[0]?.match_id;
      if (matchId) {
        const { data: matchRow } = await supabase
          .from('matches')
          .select('lost_item_id')
          .eq('id', matchId)
          .maybeSingle();

        if (matchRow?.lost_item_id) {
          return { kind: 'lost', id: matchRow.lost_item_id };
        }
      }
    }

    let query = supabase
      .from('lost_items')
      .select('id, name, status, created_at')
      .eq('user_id', userId);

    if (itemName) {
      query = query.eq('name', itemName);
    } else if (notification.type === 'resolved') {
      query = query.eq('status', 'resolved');
    }

    const { data: lostItems } = await query.order('created_at', { ascending: false }).limit(20);
    const candidates = lostItems || [];

    if (candidates.length === 0) return null;

    if (notification.type === 'match_found') {
      const { data: matches } = await supabase
        .from('matches')
        .select('lost_item_id, created_at')
        .in('lost_item_id', candidates.map((item) => item.id));

      const closestMatch = pickClosestByCreatedAt(matches || [], notification.created_at);
      if (closestMatch?.lost_item_id) {
        return { kind: 'lost', id: closestMatch.lost_item_id };
      }
    }

    const closestLostItem = pickClosestByCreatedAt(candidates, notification.created_at);
    return closestLostItem ? { kind: 'lost', id: closestLostItem.id } : null;
  };

  const resolveFoundReportTarget = async (userId: string, notification: Notification): Promise<NotificationTarget | null> => {
    const itemDescription = extractQuotedText(notification.message);
    const rejectionReason = extractRejectionReason(notification.message);
    let query = supabase
      .from('found_reports')
      .select('id, item_description, created_at, rejection_reason')
      .eq('user_id', userId);

    if (itemDescription) {
      query = query.eq('item_description', itemDescription);
    }

    const { data: reports } = await query.order('created_at', { ascending: false }).limit(20);
    const candidates = reports || [];

    if (candidates.length === 0) return null;

    if (notification.type === 'match_found') {
      const { data: matches } = await supabase
        .from('matches')
        .select('found_report_id, created_at')
        .in('found_report_id', candidates.map((item) => item.id));

      const closestMatch = pickClosestByCreatedAt(matches || [], notification.created_at);
      if (closestMatch?.found_report_id) {
        return { kind: 'found', id: closestMatch.found_report_id };
      }
    }

    if (notification.type === 'found_rejected' && rejectionReason) {
      const exactRejected = candidates.find((item) => item.rejection_reason?.trim() === rejectionReason);
      if (exactRejected) {
        return { kind: 'found', id: exactRejected.id };
      }
    }

    const closestReport = pickClosestByCreatedAt(candidates, notification.created_at);
    return closestReport ? { kind: 'found', id: closestReport.id } : null;
  };

  const resolveNotificationTarget = async (userId: string, notification: Notification): Promise<NotificationTarget | null> => {
    const parsedTarget = parseNotificationTarget(notification.message);
    if (parsedTarget) return parsedTarget;

    if (!canOpenRelatedReport(notification.type)) return null;

    const cleanMessage = stripNotificationTarget(notification.message).toLowerCase();
    const isFoundReportNotification =
      ['found_approved', 'found_rejected', 'surrender_requested', 'item_received'].includes(notification.type) ||
      (notification.type === 'match_found' && cleanMessage.includes('found report'));

    return isFoundReportNotification
      ? resolveFoundReportTarget(userId, notification)
      : resolveLostItemTarget(userId, notification);
  };

  const openRelatedReport = async (notification: Notification) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    try {
      const target = await resolveNotificationTarget(user.id, notification);
      if (!target) throw new Error('target-not-found');

      await persistNotificationTarget(notification, target);

      setSelected(null);
      router.push(target.kind === 'found' ? buildFoundRoute(target.id) : buildLostRoute(target.id));
    } catch {
      Alert.alert('Unable to Open Report', 'We could not locate the related report right now. Please check your Activity screen.');
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchNotifications();
    setRefreshing(false);
  };

  const unreadCount = notifications.filter((item) => !item.read).length;

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
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.45)',
      justifyContent: 'center',
      padding: Spacing.xl,
    },
    modalCard: {
      borderRadius: Radius.xl,
      padding: Spacing.xl,
      backgroundColor: colors.surface,
    },
    modalHeader: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: Spacing.md,
      marginBottom: Spacing.md,
    },
    modalTitle: {
      flex: 1,
      fontSize: 18,
      fontWeight: '800',
      color: colors.text,
    },
    modalMessage: {
      fontSize: 15,
      color: colors.text,
      lineHeight: 24,
      marginBottom: Spacing.md,
    },
    modalMeta: {
      fontSize: 12,
      color: colors.textSecondary,
      marginBottom: Spacing.xl,
    },
    actionButton: {
      backgroundColor: colors.primary,
      borderRadius: Radius.md,
      paddingVertical: 14,
      alignItems: 'center',
      marginBottom: Spacing.sm,
    },
    actionText: {
      color: '#fff',
      fontSize: 14,
      fontWeight: '700',
    },
    closeButton: {
      alignItems: 'center',
      paddingVertical: Spacing.sm,
    },
    closeText: {
      color: colors.textSecondary,
      fontSize: 14,
      fontWeight: '600',
    },
  });

  const renderItem = ({ item }: { item: Notification }) => {
    const icon = TYPE_ICON[item.type] || TYPE_ICON.default;
    const displayMessage = stripNotificationTarget(item.message);

    return (
      <TouchableOpacity
        style={[s.item, { backgroundColor: item.read ? colors.surface : colors.primaryMuted }]}
        onPress={() => openNotification(item)}
        activeOpacity={0.7}
      >
        <View style={[s.iconWrap, { backgroundColor: item.read ? colors.gray100 : colors.primarySoft }]}>
          <Text style={s.iconText}>{icon}</Text>
        </View>
        <View style={s.itemContent}>
          <Text style={[s.itemMessage, { fontWeight: item.read ? '400' : '600' }]} numberOfLines={2}>{displayMessage}</Text>
          <Text style={s.itemTime}>{timeAgo(item.created_at)}</Text>
        </View>
        {!item.read ? <View style={s.unreadDot} /> : null}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <View style={s.headerLeft}>
          <TouchableOpacity onPress={() => router.back()}><ChevronLeft size={24} color={colors.text} /></TouchableOpacity>
          <Text style={s.headerTitle}>Notifications</Text>
          {unreadCount > 0 ? <View style={s.badge}><Text style={s.badgeText}>{unreadCount}</Text></View> : null}
        </View>
        {unreadCount > 0 ? (
          <TouchableOpacity style={s.markAllBtn} onPress={markAllRead}>
            <CheckCheck size={16} color={colors.primary} />
            <Text style={s.markAllText}>Mark all read</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {loading ? <ActivityIndicator color={colors.primary} style={{ marginTop: 60 }} size="large" /> : (
        <FlatList
          data={notifications}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: Spacing.lg }}
          ListEmptyComponent={(
            <View style={s.empty}>
              <Bell size={64} color={colors.border} />
              <Text style={s.emptyText}>No notifications yet</Text>
              <Text style={s.emptySub}>You'll be notified about your items here</Text>
            </View>
          )}
        />
      )}

      <Modal
        visible={!!selected}
        transparent
        animationType="fade"
        statusBarTranslucent
        presentationStyle="overFullScreen"
        onRequestClose={() => setSelected(null)}
      >
        <TouchableOpacity style={s.overlay} activeOpacity={1} onPress={() => setSelected(null)}>
          <TouchableOpacity activeOpacity={1} style={s.modalCard}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>{selected ? getNotificationTitle(selected.type) : 'Notification'}</Text>
              <TouchableOpacity onPress={() => setSelected(null)}>
                <X size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {selected ? (
              <>
                <Text style={s.modalMessage}>{stripNotificationTarget(selected.message)}</Text>
                <Text style={s.modalMeta}>{new Date(selected.created_at).toLocaleString()}</Text>
              </>
            ) : null}

            {selected && canOpenRelatedReport(selected.type) ? (
              <TouchableOpacity style={s.actionButton} onPress={() => openRelatedReport(selected)}>
                <Text style={s.actionText}>Open Related Report</Text>
              </TouchableOpacity>
            ) : null}

            <TouchableOpacity style={s.closeButton} onPress={() => setSelected(null)}>
              <Text style={s.closeText}>Close</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}
