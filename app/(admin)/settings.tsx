import { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, Switch, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Moon, Sun, LogOut, User, Mail, Hash } from 'lucide-react-native';
import { useTheme } from '../../lib/ThemeContext';
import { supabase } from '../../lib/supabase';
import { Spacing, Radius } from '../../constants/theme';
import type { User as UserType } from '../../types';

export default function AdminSettingsScreen() {
  const { colors, isDark, toggle } = useTheme();
  const [admin, setAdmin] = useState<UserType | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      const { data: u } = await supabase
        .from('users')
        .select('*')
        .eq('id', data.user.id)
        .single();
      if (u) setAdmin(u);
    });
  }, []);

  const handleLogout = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out', style: 'destructive',
        onPress: async () => {
          await supabase.auth.signOut();
          router.replace('/(auth)/login');
        },
      },
    ]);
  };

  const initials = admin?.name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || 'A';

  const s = StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.background },
    header: {
      paddingHorizontal: Spacing.xl, paddingVertical: Spacing.lg,
      backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border,
    },
    headerTitle: { fontSize: 22, fontWeight: '800', color: colors.text },
    scroll: { paddingBottom: Spacing.lg },
    avatarSection: {
      alignItems: 'center', paddingVertical: Spacing.xxxl,
      backgroundColor: colors.surface, marginBottom: Spacing.md,
    },
    avatar: {
      width: 80, height: 80, borderRadius: 40,
      backgroundColor: colors.primaryMuted, alignItems: 'center', justifyContent: 'center',
      marginBottom: Spacing.md, borderWidth: 3, borderColor: colors.primarySoft,
    },
    avatarText: { fontSize: 30, fontWeight: '800', color: colors.primary },
    adminBadge: {
      backgroundColor: colors.primary, paddingHorizontal: Spacing.md,
      paddingVertical: 3, borderRadius: Radius.full, marginBottom: 4,
    },
    adminBadgeText: { fontSize: 11, fontWeight: '700', color: '#fff' },
    userName: { fontSize: 18, fontWeight: '800', color: colors.text },
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
    logoutBtn: {
      marginHorizontal: Spacing.xl, marginTop: Spacing.sm,
      backgroundColor: '#FEE2E2', borderRadius: Radius.lg,
      paddingVertical: Spacing.lg, flexDirection: 'row',
      alignItems: 'center', justifyContent: 'center', gap: Spacing.sm,
      borderWidth: 1, borderColor: '#FECACA',
    },
    logoutText: { fontSize: 15, fontWeight: '700', color: colors.error },
  });

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <Text style={s.headerTitle}>Settings</Text>
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        <View style={s.avatarSection}>
          <View style={s.avatar}>
            <Text style={s.avatarText}>{initials}</Text>
          </View>
          <View style={s.adminBadge}>
            <Text style={s.adminBadgeText}>ADMIN</Text>
          </View>
          <Text style={s.userName}>{admin?.name || '—'}</Text>
        </View>

        <View style={s.section}>
          <Text style={s.sectionTitle}>Account Info</Text>
          <View style={[s.row, s.rowFirst]}>
            <View style={[s.rowIcon, { backgroundColor: colors.primaryMuted }]}>
              <Hash size={18} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.rowLabel}>Admin ID</Text>
              <Text style={s.rowValue}>{admin?.student_id || '—'}</Text>
            </View>
          </View>
          <View style={s.row}>
            <View style={[s.rowIcon, { backgroundColor: colors.primaryMuted }]}>
              <User size={18} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.rowLabel}>Full Name</Text>
              <Text style={s.rowValue}>{admin?.name || '—'}</Text>
            </View>
          </View>
          <View style={s.row}>
            <View style={[s.rowIcon, { backgroundColor: colors.primaryMuted }]}>
              <Mail size={18} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.rowLabel}>Email</Text>
              <Text style={s.rowValue}>{admin?.email || '—'}</Text>
            </View>
          </View>
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
              value={isDark}
              onValueChange={toggle}
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
