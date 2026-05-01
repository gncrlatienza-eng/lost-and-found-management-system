import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  RefreshControl, TextInput, Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Bell, Send, Users, X } from 'lucide-react-native';
import { supabase } from '../../lib/supabase';
import { Colors, Spacing, Radius } from '../../constants/theme';

interface NotifLog {
  id: string;
  type: string;
  message: string;
  user_id: string;
  created_at: string;
  read: boolean;
  user?: { name: string };
}

export default function AdminNotificationsScreen() {
  const [notifs, setNotifs] = useState<NotifLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [showCompose, setShowCompose] = useState(false);

  const fetchNotifs = async () => {
    const { data } = await supabase
      .from('notifications')
      .select('*, user:users(name)')
      .order('created_at', { ascending: false })
      .limit(50);
    setNotifs((data as NotifLog[]) || []);
  };

  const load = async () => { setLoading(true); await fetchNotifs(); setLoading(false); };
  const onRefresh = useCallback(async () => { setRefreshing(true); await fetchNotifs(); setRefreshing(false); }, []);
  useEffect(() => { load(); }, []);

  const handleBroadcast = async () => {
    if (!message.trim()) return Alert.alert('Required', 'Please enter a message.');
    Alert.alert('Broadcast to All Students?', `"${message.trim()}"`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Send', onPress: async () => {
          setSending(true);
          try {
            const { data: students } = await supabase.from('users').select('id').eq('role', 'student');
            if (!students?.length) throw new Error('No students found.');
            const notifRows = students.map(s => ({
              user_id: s.id, type: 'admin_broadcast', message: message.trim(),
            }));
            const { error } = await supabase.from('notifications').insert(notifRows);
            if (error) throw error;
            Alert.alert('Sent!', `Broadcast sent to ${students.length} students.`);
            setMessage(''); setShowCompose(false); fetchNotifs();
          } catch (e: any) { Alert.alert('Error', e.message); }
          setSending(false);
        },
      },
    ]);
  };

  const typeColor: Record<string, string> = {
    match_found: '#3B82F6',
    found_approved: Colors.success,
    found_rejected: Colors.error,
    ready_for_claiming: Colors.warning,
    resolved: Colors.gray500,
    admin_broadcast: Colors.primary,
  };

  const renderItem = ({ item }: { item: NotifLog }) => {
    const color = typeColor[item.type] ?? Colors.gray400;
    return (
      <View style={[s.notifCard, !item.read && s.notifUnread]}>
        <View style={[s.notifDot, { backgroundColor: color }]} />
        <View style={s.notifContent}>
          <View style={s.notifTopRow}>
            <View style={[s.typeBadge, { backgroundColor: color + '18' }]}>
              <Text style={[s.typeText, { color }]}>{item.type.replace(/_/g, ' ')}</Text>
            </View>
            <Text style={s.notifTime}>{new Date(item.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</Text>
          </View>
          <Text style={s.notifMessage}>{item.message}</Text>
          <Text style={s.notifUser}>→ {item.user?.name ?? 'Unknown'}</Text>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <View>
          <Text style={s.headerTitle}>Notifications</Text>
          <Text style={s.headerSub}>All system notifications</Text>
        </View>
        <TouchableOpacity style={s.composeBtn} onPress={() => setShowCompose(v => !v)}>
          {showCompose ? <X size={18} color={Colors.primary} /> : <Send size={18} color={Colors.primary} />}
        </TouchableOpacity>
      </View>

      {/* Compose Broadcast */}
      {showCompose && (
        <View style={s.composeCard}>
          <View style={s.composeHeader}>
            <Users size={16} color={Colors.primary} />
            <Text style={s.composeTitle}>Broadcast to All Students</Text>
          </View>
          <TextInput
            style={s.composeInput}
            placeholder="Type your message here..."
            placeholderTextColor={Colors.textMuted}
            value={message}
            onChangeText={setMessage}
            multiline
          />
          <TouchableOpacity
            style={[s.sendBtn, (!message.trim() || sending) && s.sendBtnDisabled]}
            onPress={handleBroadcast}
            disabled={!message.trim() || sending}
          >
            <Send size={16} color="#fff" />
            <Text style={s.sendBtnText}>{sending ? 'Sending...' : 'Send Broadcast'}</Text>
          </TouchableOpacity>
        </View>
      )}

      {loading ? <ActivityIndicator style={{ marginTop: 60 }} size="large" color={Colors.primary} /> : (
        <FlatList
          data={notifs}
          keyExtractor={i => i.id}
          renderItem={renderItem}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
          contentContainerStyle={{ padding: Spacing.xl, paddingBottom: Spacing.lg }}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={s.empty}>
              <Bell size={40} color={Colors.gray300} />
              <Text style={s.emptyText}>No notifications yet</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: Colors.surface, paddingHorizontal: Spacing.xl, paddingVertical: Spacing.lg, borderBottomWidth: 1, borderBottomColor: Colors.border },
  headerTitle: { fontSize: 20, fontWeight: '800', color: Colors.text },
  headerSub: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  composeBtn: { padding: Spacing.sm, backgroundColor: Colors.primaryMuted, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.primary + '30' },
  composeCard: { backgroundColor: Colors.surface, margin: Spacing.xl, marginBottom: 0, borderRadius: Radius.lg, padding: Spacing.lg, gap: Spacing.md, borderWidth: 1, borderColor: Colors.border, elevation: 2 },
  composeHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  composeTitle: { fontSize: 14, fontWeight: '700', color: Colors.text },
  composeInput: { backgroundColor: Colors.gray100, borderRadius: Radius.md, padding: Spacing.md, fontSize: 14, color: Colors.text, borderWidth: 1, borderColor: Colors.border, minHeight: 80, textAlignVertical: 'top' },
  sendBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, backgroundColor: Colors.primary, borderRadius: Radius.md, paddingVertical: 12 },
  sendBtnDisabled: { opacity: 0.4 },
  sendBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
  notifCard: { backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: Spacing.md, marginBottom: Spacing.sm, borderWidth: 1, borderColor: Colors.border, flexDirection: 'row', gap: Spacing.md, elevation: 1 },
  notifUnread: { borderColor: Colors.primary + '40', backgroundColor: Colors.primaryMuted },
  notifDot: { width: 8, height: 8, borderRadius: 4, marginTop: 4, flexShrink: 0 },
  notifContent: { flex: 1, gap: 4 },
  notifTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  typeBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: Radius.sm },
  typeText: { fontSize: 10, fontWeight: '700', textTransform: 'capitalize' },
  notifTime: { fontSize: 11, color: Colors.textMuted },
  notifMessage: { fontSize: 13, color: Colors.text, lineHeight: 20 },
  notifUser: { fontSize: 11, color: Colors.textSecondary },
  empty: { alignItems: 'center', marginTop: 80, gap: Spacing.md },
  emptyText: { fontSize: 16, fontWeight: '700', color: Colors.textSecondary },
});
