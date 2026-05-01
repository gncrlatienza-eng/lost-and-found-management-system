import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, Switch, Alert, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import {
  User, Mail, Phone, Hash, LogOut, Moon, Sun, Edit3, Check, X,
} from 'lucide-react-native';
import { useTheme } from '../../lib/ThemeContext';
import { supabase } from '../../lib/supabase';
import { Spacing, Radius } from '../../constants/theme';
import type { User as UserType } from '../../types';

export default function ProfileScreen() {
  const { colors, isDark, toggle } = useTheme();
  const [user, setUser] = useState<UserType | null>(null);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [saving, setSaving] = useState(false);
  const [stats, setStats] = useState({ lost: 0, found: 0, resolved: 0 });

  const fetchUser = useCallback(async () => {
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) return;
    const { data } = await supabase.from('users').select('*').eq('id', authUser.id).single();
    if (data) { setUser(data); setName(data.name); setContact(data.contact); }
    const [lost, found] = await Promise.all([
      supabase.from('lost_items').select('*', { count: 'exact', head: true }).eq('user_id', authUser.id),
      supabase.from('found_reports').select('*', { count: 'exact', head: true }).eq('user_id', authUser.id),
    ]);
    const { count: resolved } = await supabase.from('lost_items').select('*', { count: 'exact', head: true }).eq('user_id', authUser.id).eq('status', 'resolved');
    setStats({ lost: lost.count || 0, found: found.count || 0, resolved: resolved || 0 });
  }, []);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  useFocusEffect(
    useCallback(() => {
      fetchUser();
    }, [fetchUser])
  );

  const saveProfile = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase.from('users').update({ name, contact }).eq('id', user.id);
    if (error) Alert.alert('Error', error.message);
    else {
      setUser(u => u ? { ...u, name, contact } : u);
      setEditing(false);
      Alert.alert('Saved', 'Your profile has been updated.');
    }
    setSaving(false);
  };

  const handleLogout = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: () => supabase.auth.signOut() },
    ]);
  };

  const s = StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.background },
    scroll: { paddingBottom: Spacing.xl },
    header: {
      paddingHorizontal: Spacing.xl, paddingVertical: Spacing.lg,
      backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border,
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    },
    headerTitle: { fontSize: 22, fontWeight: '800', color: colors.text },
    avatarSection: {
      alignItems: 'center', paddingVertical: Spacing.xxxl,
      backgroundColor: colors.surface, marginBottom: Spacing.md,
    },
    avatar: {
      width: 88, height: 88, borderRadius: 44,
      backgroundColor: colors.primaryMuted, alignItems: 'center', justifyContent: 'center',
      marginBottom: Spacing.md, borderWidth: 3, borderColor: colors.primarySoft,
    },
    avatarText: { fontSize: 36, fontWeight: '800', color: colors.primary },
    userName: { fontSize: 20, fontWeight: '800', color: colors.text, marginBottom: 4 },
    userEmail: { fontSize: 14, color: colors.textSecondary },
    statsRow: {
      flexDirection: 'row', marginHorizontal: Spacing.xl, marginBottom: Spacing.md,
      backgroundColor: colors.surface, borderRadius: Radius.lg,
      borderWidth: 1, borderColor: colors.border, overflow: 'hidden',
    },
    stat: { flex: 1, alignItems: 'center', paddingVertical: Spacing.lg },
    statDivider: { width: 1, backgroundColor: colors.border, marginVertical: Spacing.md },
    statNum: { fontSize: 22, fontWeight: '800', color: colors.primary },
    statLabel: { fontSize: 11, color: colors.textSecondary, marginTop: 2 },
    section: {
      marginHorizontal: Spacing.xl, marginBottom: Spacing.md,
      backgroundColor: colors.surface, borderRadius: Radius.lg,
      borderWidth: 1, borderColor: colors.border, overflow: 'hidden',
    },
    sectionTitle: {
      fontSize: 12, fontWeight: '700', color: colors.textMuted,
      paddingHorizontal: Spacing.lg, paddingTop: Spacing.lg, paddingBottom: Spacing.sm,
      textTransform: 'uppercase', letterSpacing: 0.5,
    },
    row: {
      flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.lg,
      paddingVertical: Spacing.md, borderTopWidth: 1, borderTopColor: colors.border,
    },
    rowFirst: { borderTopWidth: 0 },
    rowIcon: {
      width: 36, height: 36, borderRadius: 10, alignItems: 'center',
      justifyContent: 'center', marginRight: Spacing.md,
    },
    rowLabel: { fontSize: 13, color: colors.textSecondary, marginBottom: 2 },
    rowValue: { fontSize: 15, color: colors.text, fontWeight: '500' },
    rowInput: { fontSize: 15, color: colors.text, flex: 1, fontWeight: '500', paddingVertical: 0 },
    editBtnRow: { flexDirection: 'row', gap: Spacing.sm, padding: Spacing.lg, paddingTop: Spacing.sm },
    saveBtn: {
      flex: 1, backgroundColor: colors.primary, borderRadius: Radius.sm,
      paddingVertical: Spacing.md, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6,
    },
    saveBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
    cancelBtn: {
      flex: 1, backgroundColor: colors.gray100, borderRadius: Radius.sm,
      paddingVertical: Spacing.md, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6,
    },
    cancelBtnText: { fontSize: 14, fontWeight: '600', color: colors.text },
    logoutBtn: {
      marginHorizontal: Spacing.xl, marginTop: Spacing.sm,
      backgroundColor: '#FEE2E2', borderRadius: Radius.lg,
      paddingVertical: Spacing.lg, flexDirection: 'row',
      alignItems: 'center', justifyContent: 'center', gap: Spacing.sm,
      borderWidth: 1, borderColor: '#FECACA',
    },
    logoutText: { fontSize: 15, fontWeight: '700', color: colors.error },
    editIconBtn: { padding: 10, marginRight: -6 },
  });

  const initials = user?.name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || '?';

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <Text style={s.headerTitle}>Profile</Text>
        {!editing && (
          <TouchableOpacity style={s.editIconBtn} onPress={() => setEditing(true)}>
            <Edit3 size={20} color={colors.primary} />
          </TouchableOpacity>
        )}
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        <View style={s.avatarSection}>
          <View style={s.avatar}><Text style={s.avatarText}>{initials}</Text></View>
          <Text style={s.userName}>{user?.name || '—'}</Text>
          <Text style={s.userEmail}>{user?.email || '—'}</Text>
        </View>

        <View style={s.statsRow}>
          <View style={s.stat}>
            <Text style={s.statNum}>{stats.lost}</Text>
            <Text style={s.statLabel}>Lost Posts</Text>
          </View>
          <View style={s.statDivider} />
          <View style={s.stat}>
            <Text style={s.statNum}>{stats.found}</Text>
            <Text style={s.statLabel}>Found Reports</Text>
          </View>
          <View style={s.statDivider} />
          <View style={s.stat}>
            <Text style={s.statNum}>{stats.resolved}</Text>
            <Text style={s.statLabel}>Resolved</Text>
          </View>
        </View>

        <View style={s.section}>
          <Text style={s.sectionTitle}>Account Info</Text>
          <View style={[s.row, s.rowFirst]}>
            <View style={[s.rowIcon, { backgroundColor: colors.primaryMuted }]}>
              <Hash size={18} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.rowLabel}>Student ID</Text>
              <Text style={s.rowValue}>{user?.student_id || '—'}</Text>
            </View>
          </View>
          <View style={s.row}>
            <View style={[s.rowIcon, { backgroundColor: colors.primaryMuted }]}>
              <User size={18} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.rowLabel}>Full Name</Text>
              {editing
                ? <TextInput style={[s.rowInput, { borderWidth: 1, borderColor: colors.border, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, backgroundColor: colors.gray100 }]} value={name} onChangeText={setName} />
                : <Text style={s.rowValue}>{user?.name || '—'}</Text>
              }
            </View>
          </View>
          <View style={s.row}>
            <View style={[s.rowIcon, { backgroundColor: colors.primaryMuted }]}>
              <Mail size={18} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.rowLabel}>Email</Text>
              <Text style={s.rowValue}>{user?.email || '—'}</Text>
            </View>
          </View>
          <View style={s.row}>
            <View style={[s.rowIcon, { backgroundColor: colors.primaryMuted }]}>
              <Phone size={18} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.rowLabel}>Contact Number</Text>
              {editing
                ? <TextInput style={[s.rowInput, { borderWidth: 1, borderColor: colors.border, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, backgroundColor: colors.gray100 }]} value={contact} onChangeText={setContact} keyboardType="phone-pad" />
                : <Text style={s.rowValue}>{user?.contact || '—'}</Text>
              }
            </View>
          </View>
          {editing && (
            <View style={s.editBtnRow}>
              <TouchableOpacity style={s.saveBtn} onPress={saveProfile} disabled={saving}>
                <Check size={16} color="#fff" />
                <Text style={s.saveBtnText}>{saving ? 'Saving...' : 'Save'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.cancelBtn} onPress={() => { setEditing(false); setName(user?.name || ''); setContact(user?.contact || ''); }}>
                <X size={16} color={colors.text} />
                <Text style={s.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        <View style={s.section}>
          <Text style={s.sectionTitle}>Appearance</Text>
          <View style={[s.row, s.rowFirst]}>
            <View style={[s.rowIcon, { backgroundColor: isDark ? '#1E293B' : '#FEF9C3' }]}>
              {isDark ? <Moon size={18} color="#94A3B8" /> : <Sun size={18} color="#CA8A04" />}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.rowLabel}>Theme</Text>
              <Text style={s.rowValue}>{isDark ? 'Dark Mode' : 'Light Mode'}</Text>
            </View>
            <Switch
              value={isDark} onValueChange={toggle}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor="#fff"
            />
          </View>
        </View>

        <TouchableOpacity style={s.logoutBtn} onPress={handleLogout} activeOpacity={0.8}>
          <LogOut size={20} color={colors.error} />
          <Text style={s.logoutText}>Sign Out</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}
