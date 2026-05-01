import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  RefreshControl, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import {
  Search, FileCheck, GitMerge, Package, Users,
  Clock, ChevronRight, AlertCircle, CheckCircle, TrendingUp,
} from 'lucide-react-native';
import { supabase } from '../../lib/supabase';
import { useTheme } from '../../lib/ThemeContext';
import { Spacing, Radius } from '../../constants/theme';
import type { LostItem, FoundReport } from '../../types';

interface Stats {
  searching: number;
  ready_for_claiming: number;
  resolved: number;
  pending_found: number;
  approved_found: number;
  pending_matches: number;
  total_students: number;
}

type ActivityItem =
  | { kind: 'lost'; data: LostItem & { user?: { name: string } } }
  | { kind: 'found'; data: FoundReport & { user?: { name: string } } };

const timeAgo = (iso: string) => {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
};

export default function AdminDashboard() {
  const { colors } = useTheme();
  const [stats, setStats] = useState<Stats | null>(null);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [adminName, setAdminName] = useState('Admin');

  const LOST_STATUS_COLOR: Record<string, string> = {
    searching: colors.warning, possible_match: '#3B82F6',
    ready_for_claiming: colors.success, resolved: colors.gray500, expired: colors.error,
  };
  const FOUND_STATUS_COLOR: Record<string, string> = {
    pending_review: colors.warning, approved: colors.success, rejected: colors.error,
    waiting_submission: '#3B82F6', submitted_to_sdfo: colors.primary,
    matched_to_owner: colors.accent, resolved: colors.gray500,
  };

  const fetchData = async () => {
    const [s, rfc, res, pf, af, pmatch, ts, lostRes, foundRes, userRes] = await Promise.all([
      supabase.from('lost_items').select('*', { count: 'exact', head: true }).eq('status', 'searching'),
      supabase.from('lost_items').select('*', { count: 'exact', head: true }).eq('status', 'ready_for_claiming'),
      supabase.from('lost_items').select('*', { count: 'exact', head: true }).eq('status', 'resolved'),
      supabase.from('found_reports').select('*', { count: 'exact', head: true }).eq('status', 'pending_review'),
      supabase.from('found_reports').select('*', { count: 'exact', head: true }).eq('status', 'approved'),
      supabase.from('matches').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('users').select('*', { count: 'exact', head: true }).eq('role', 'student'),
      supabase.from('lost_items').select('*, user:users(name)').order('created_at', { ascending: false }).limit(5),
      supabase.from('found_reports').select('*, user:users(name)').order('created_at', { ascending: false }).limit(5),
      supabase.auth.getUser(),
    ]);

    setStats({
      searching: s.count || 0,
      ready_for_claiming: rfc.count || 0,
      resolved: res.count || 0,
      pending_found: pf.count || 0,
      approved_found: af.count || 0,
      pending_matches: pmatch.count || 0,
      total_students: ts.count || 0,
    });

    const mixed: ActivityItem[] = [
      ...(lostRes.data || []).map((d): ActivityItem => ({ kind: 'lost', data: d })),
      ...(foundRes.data || []).map((d): ActivityItem => ({ kind: 'found', data: d })),
    ].sort((a, b) => new Date(b.data.created_at).getTime() - new Date(a.data.created_at).getTime()).slice(0, 8);
    setActivity(mixed);

    if (userRes.data.user) {
      const { data: u } = await supabase.from('users').select('name').eq('id', userRes.data.user.id).single();
      if (u?.name) setAdminName(u.name.split(' ')[0]);
    }
  };

  const load = async () => { setLoading(true); await fetchData(); setLoading(false); };
  const onRefresh = useCallback(async () => { setRefreshing(true); await fetchData(); setRefreshing(false); }, []);
  useEffect(() => { load(); }, []);

  const s = StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.background },
    header: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md,
      backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border,
    },
    headerTitle: { fontSize: 22, fontWeight: '800', color: colors.primary },
    adminBadge: { fontSize: 11, fontWeight: '700', color: colors.white, backgroundColor: colors.primary },
    headerSub: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
    scroll: { padding: Spacing.xl, paddingBottom: Spacing.lg },
    sectionLabel: { fontSize: 11, fontWeight: '700', color: colors.textSecondary, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: Spacing.sm },
    statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginBottom: Spacing.xl },
    statCard: {
      width: '31%', backgroundColor: colors.surface, borderRadius: Radius.lg,
      padding: Spacing.md, alignItems: 'center', gap: 4,
      borderWidth: 1, borderColor: colors.border, elevation: 1,
    },
    statIcon: { width: 32, height: 32, borderRadius: Radius.sm, alignItems: 'center', justifyContent: 'center' },
    statNum: { fontSize: 20, fontWeight: '800' },
    statLabel: { fontSize: 10, color: colors.textMuted, fontWeight: '600', textAlign: 'center' },
    actionsRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.xl },
    actionBtn: {
      flex: 1, borderRadius: Radius.lg, paddingVertical: Spacing.lg,
      alignItems: 'center', gap: Spacing.sm, borderWidth: 1, position: 'relative',
    },
    actionBadge: {
      position: 'absolute', top: 6, right: 6, width: 18, height: 18,
      borderRadius: 9, alignItems: 'center', justifyContent: 'center',
    },
    actionBadgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },
    actionLabel: { fontSize: 11, fontWeight: '700', textAlign: 'center' },
    summaryCard: {
      backgroundColor: colors.surface, borderRadius: Radius.lg,
      padding: Spacing.lg, borderWidth: 1, borderColor: colors.border,
      marginBottom: Spacing.xl, elevation: 1,
    },
    summaryRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.lg },
    summaryTitle: { fontSize: 13, fontWeight: '700', color: colors.text },
    summaryGrid: { flexDirection: 'row' },
    summaryItem: { flex: 1, alignItems: 'center', position: 'relative' },
    summaryNum: { fontSize: 22, fontWeight: '800', color: colors.primary },
    summaryItemLabel: { fontSize: 11, color: colors.textSecondary, marginTop: 2 },
    summaryDivider: { position: 'absolute', right: 0, top: 4, width: 1, height: 36, backgroundColor: colors.border },
    activityHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.sm },
    activitySub: { fontSize: 11, color: colors.textMuted },
    empty: { alignItems: 'center', paddingVertical: Spacing.xxxl, gap: Spacing.md },
    emptyText: { fontSize: 14, color: colors.textMuted },
    activityCard: {
      flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
      backgroundColor: colors.surface, borderRadius: Radius.lg,
      padding: Spacing.md, marginBottom: Spacing.sm,
      borderWidth: 1, borderColor: colors.border, elevation: 1,
    },
    activityDot: { width: 10, height: 10, borderRadius: 5 },
    activityContent: { flex: 1, gap: 3 },
    activityTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    kindBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: Radius.sm },
    kindText: { fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
    activityTime: { fontSize: 11, color: colors.textMuted },
    activityName: { fontSize: 14, fontWeight: '700', color: colors.text },
    activityMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    activityUser: { fontSize: 12, color: colors.textSecondary, flex: 1 },
    statusPill: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: Radius.sm },
    statusPillText: { fontSize: 10, fontWeight: '600', textTransform: 'capitalize' },
  });

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <View>
          <Text style={s.headerTitle}>LAFMS <Text style={s.adminBadge}>ADMIN</Text></Text>
          <Text style={s.headerSub}>Good day, {adminName} 👋</Text>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={s.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        {loading ? <ActivityIndicator style={{ marginTop: 60 }} size="large" color={colors.primary} /> : <>

          {/* Stats */}
          <View style={s.statsGrid}>
            {[
              { label: 'Searching',    value: stats?.searching,          color: colors.warning, icon: Search },
              { label: 'Pending Found', value: stats?.pending_found,     color: '#3B82F6',      icon: FileCheck },
              { label: 'Unmatched',    value: stats?.pending_matches,    color: colors.primary, icon: GitMerge },
              { label: 'To Claim',     value: stats?.ready_for_claiming, color: colors.success, icon: Package },
              { label: 'Resolved',     value: stats?.resolved,           color: colors.gray500, icon: CheckCircle },
              { label: 'Students',     value: stats?.total_students,     color: colors.accent,  icon: Users },
            ].map(({ label, value, color, icon: Icon }) => (
              <View key={label} style={s.statCard}>
                <View style={[s.statIcon, { backgroundColor: color + '18' }]}>
                  <Icon size={16} color={color} />
                </View>
                <Text style={[s.statNum, { color }]}>{value ?? 0}</Text>
                <Text style={s.statLabel}>{label}</Text>
              </View>
            ))}
          </View>

          {/* Quick Actions */}
          <Text style={s.sectionLabel}>Quick Actions</Text>
          <View style={s.actionsRow}>
            {[
              { label: 'Review\nFound',  color: colors.warning, icon: FileCheck, badge: stats?.pending_found,   route: '/(admin)/found-items' },
              { label: 'Match\nItems',   color: colors.primary, icon: GitMerge,  badge: stats?.approved_found,  route: '/(admin)/matching' },
              { label: 'Manage\nClaims', color: colors.success, icon: Package,   badge: stats?.pending_matches, route: '/(admin)/claims' },
            ].map(({ label, color, icon: Icon, badge, route }) => (
              <TouchableOpacity
                key={label}
                style={[s.actionBtn, { borderColor: color + '40', backgroundColor: color + '10' }]}
                onPress={() => router.push(route as any)}
                activeOpacity={0.8}
              >
                {(badge ?? 0) > 0 && (
                  <View style={[s.actionBadge, { backgroundColor: color }]}>
                    <Text style={s.actionBadgeText}>{badge}</Text>
                  </View>
                )}
                <Icon size={22} color={color} />
                <Text style={[s.actionLabel, { color }]}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Summary Bar */}
          <View style={s.summaryCard}>
            <View style={s.summaryRow}>
              <TrendingUp size={14} color={colors.primary} />
              <Text style={s.summaryTitle}>System Overview</Text>
            </View>
            <View style={s.summaryGrid}>
              {[
                { num: stats?.searching ?? 0,       label: 'Active Lost' },
                { num: stats?.approved_found ?? 0,  label: 'Approved Found' },
                { num: stats?.total_students ?? 0,  label: 'Students' },
              ].map(({ num, label }, i, arr) => (
                <View key={label} style={s.summaryItem}>
                  <Text style={s.summaryNum}>{num}</Text>
                  <Text style={s.summaryItemLabel}>{label}</Text>
                  {i < arr.length - 1 && <View style={s.summaryDivider} />}
                </View>
              ))}
            </View>
          </View>

          {/* Recent Activity */}
          <View style={s.activityHeader}>
            <Text style={s.sectionLabel}>Recent Activity</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Clock size={11} color={colors.textMuted} />
              <Text style={s.activitySub}>Latest updates</Text>
            </View>
          </View>

          {activity.length === 0 ? (
            <View style={s.empty}>
              <AlertCircle size={32} color={colors.gray300} />
              <Text style={s.emptyText}>No recent activity</Text>
            </View>
          ) : activity.map(item => {
            const isLost = item.kind === 'lost';
            const lost = item.data as LostItem & { user?: { name: string } };
            const found = item.data as FoundReport & { user?: { name: string } };
            const statusColor = isLost
              ? (LOST_STATUS_COLOR[lost.status] ?? colors.gray400)
              : (FOUND_STATUS_COLOR[found.status] ?? colors.gray400);
            const targetRoute = isLost ? '/(admin)/matching' : '/(admin)/found-items';
            return (
              <TouchableOpacity
                key={item.data.id}
                style={s.activityCard}
                onPress={() => router.push(targetRoute as any)}
                activeOpacity={0.8}
              >
                <View style={[s.activityDot, { backgroundColor: statusColor }]} />
                <View style={s.activityContent}>
                  <View style={s.activityTopRow}>
                    <View style={[s.kindBadge, { backgroundColor: isLost ? colors.error + '18' : colors.primary + '18' }]}>
                      <Text style={[s.kindText, { color: isLost ? colors.error : colors.primary }]}>
                        {isLost ? 'LOST' : 'FOUND'}
                      </Text>
                    </View>
                    <Text style={s.activityTime}>{timeAgo(item.data.created_at)}</Text>
                  </View>
                  <Text style={s.activityName} numberOfLines={1}>
                    {isLost ? lost.name : found.item_description}
                  </Text>
                  <View style={s.activityMeta}>
                    <Text style={s.activityUser}>{item.data.user?.name ?? 'Unknown'}</Text>
                    <View style={[s.statusPill, { backgroundColor: statusColor + '20' }]}>
                      <Text style={[s.statusPillText, { color: statusColor }]}>
                        {(isLost ? lost.status : found.status).replace(/_/g, ' ')}
                      </Text>
                    </View>
                  </View>
                </View>
                <ChevronRight size={14} color={colors.gray300} />
              </TouchableOpacity>
            );
          })}
        </>}
      </ScrollView>
    </SafeAreaView>
  );
}
