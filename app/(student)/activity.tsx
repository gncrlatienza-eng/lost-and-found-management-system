import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  RefreshControl, ActivityIndicator, Image, Modal, ScrollView,
  TextInput, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { MapPin, Calendar, AlertCircle, Camera, X, CheckCircle } from 'lucide-react-native';
import { useTheme } from '../../lib/ThemeContext';
import { supabase } from '../../lib/supabase';
import { Spacing, Radius } from '../../constants/theme';
import type { LostItem, FoundReport } from '../../types';

const FOUND_BUCKET = 'found-items';

const resolvePhotoUrl = (uri: string): string => {
  if (!uri || uri.startsWith('http')) return uri;
  return supabase.storage.from(FOUND_BUCKET).getPublicUrl(uri).data.publicUrl;
};

const LOST_STATUS: Record<string, { label: string; color: string; step: number }> = {
  searching:          { label: 'Searching',        color: '#F59E0B', step: 0 },
  possible_match:     { label: 'Match Found',       color: '#3B82F6', step: 1 },
  ready_for_claiming: { label: 'Ready to Claim',    color: '#10B981', step: 2 },
  resolved:           { label: 'Resolved',          color: '#6B7280', step: 3 },
  expired:            { label: 'Expired',           color: '#EF4444', step: 3 },
};

const FOUND_STATUS: Record<string, { label: string; color: string }> = {
  pending_review:     { label: 'Pending Review',    color: '#F59E0B' },
  approved:           { label: 'Approved',          color: '#10B981' },
  waiting_submission: { label: 'Waiting Submission', color: '#3B82F6' },
  submitted_to_sdfo:  { label: 'Submitted to SDFO', color: '#8B5CF6' },
  matched_to_owner:   { label: 'Matched to Owner',  color: '#06B6D4' },
  resolved:           { label: 'Resolved',          color: '#6B7280' },
  rejected:           { label: 'Rejected',          color: '#EF4444' },
};

const LOST_STEPS = ['Searching', 'Match Found', 'Ready to Claim', 'Resolved'];

type ProofItem = { lostItem: LostItem; matchId: string };

export default function ActivityScreen() {
  const { colors } = useTheme();
  const { tab: tabParam } = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState<'lost' | 'found'>(tabParam === 'found' ? 'found' : 'lost');

  useEffect(() => {
    if (tabParam === 'found') setTab('found');
  }, [tabParam]);
  const [lostItems, setLostItems] = useState<LostItem[]>([]);
  const [foundReports, setFoundReports] = useState<FoundReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [proofItem, setProofItem] = useState<ProofItem | null>(null);
  const [proofPhotos, setProofPhotos] = useState<string[]>([]);
  const [proofDescription, setProofDescription] = useState('');
  const [proofSubmitting, setProofSubmitting] = useState(false);
  const [proofSubmittedIds, setProofSubmittedIds] = useState<Set<string>>(new Set());

  const fetchData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const [lost, found] = await Promise.all([
      supabase.from('lost_items').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
      supabase.from('found_reports').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
    ]);

    const lostData: LostItem[] = lost.data || [];
    setLostItems(lostData);
    setFoundReports(found.data || []);

    const possibleMatchIds = lostData.filter(i => i.status === 'possible_match').map(i => i.id);
    if (possibleMatchIds.length > 0) {
      const { data: matches } = await supabase
        .from('matches').select('id, lost_item_id').in('lost_item_id', possibleMatchIds);

      if (matches && matches.length > 0) {
        const mIds = matches.map((m: any) => m.id);
        const { data: claims } = await supabase
          .from('claims').select('match_id').in('match_id', mIds).not('proof_photos', 'is', null);

        if (claims && claims.length > 0) {
          const submittedMatchIds = new Set(claims.map((c: any) => c.match_id));
          const submittedLostIds = new Set(
            (matches as any[]).filter((m: any) => submittedMatchIds.has(m.id)).map((m: any) => m.lost_item_id)
          );
          setProofSubmittedIds(submittedLostIds as Set<string>);
        } else {
          setProofSubmittedIds(new Set());
        }
      }
    }

    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, []);

  const onRefresh = async () => { setRefreshing(true); await fetchData(); setRefreshing(false); };

  const openProofModal = async (item: LostItem) => {
    const { data: matches } = await supabase
      .from('matches').select('id').eq('lost_item_id', item.id)
      .order('created_at', { ascending: false }).limit(1);

    const match = matches?.[0];
    if (!match) return Alert.alert('Not Ready', 'No match has been created yet. Please wait for the admin.');

    setProofItem({ lostItem: item, matchId: match.id });
    setProofPhotos([]);
    setProofDescription('');
  };

  const pickProofPhoto = async () => {
    if (proofPhotos.length >= 3) return Alert.alert('Max 3 photos for proof');
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (!result.canceled) setProofPhotos(p => [...p, result.assets[0].uri]);
  };

  // ✅ Same working pattern as post.tsx
  const uploadProofPhotos = async (userId: string): Promise<string[]> => {
    const urls: string[] = [];
    for (const uri of proofPhotos) {
      if (uri.startsWith('http')) { urls.push(uri); continue; }
      try {
        const rawExt = uri.split('.').pop()?.toLowerCase() || 'jpeg';
        const ext = rawExt === 'jpg' ? 'jpeg' : rawExt;
        const path = `proofs/${userId}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;

        const base64 = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' });
        const byteChars = atob(base64);
        const byteArray = new Uint8Array(byteChars.length);
        for (let i = 0; i < byteChars.length; i++) byteArray[i] = byteChars.charCodeAt(i);

        const { error: uploadError } = await supabase.storage
          .from(FOUND_BUCKET)
          .upload(path, byteArray, { contentType: `image/${ext}`, upsert: true });

        if (uploadError) { console.warn('[proof upload error]', uploadError.message); continue; }

        const { data: urlData } = supabase.storage.from(FOUND_BUCKET).getPublicUrl(path);
        if (urlData?.publicUrl) urls.push(urlData.publicUrl);
      } catch (err: any) { console.warn('[proof upload exception]', err.message); }
    }
    return urls;
  };

  const submitProof = async () => {
    if (!proofItem) return;
    if (proofPhotos.length === 0) return Alert.alert('Required', 'Please add at least 1 proof photo.');
    if (!proofDescription.trim()) return Alert.alert('Required', 'Please describe why this item is yours.');

    setProofSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not logged in');

      const uploadedUrls = await uploadProofPhotos(user.id);
      if (uploadedUrls.length === 0) throw new Error('Photo upload failed. Please try again.');

      let matchId = proofItem.matchId;
      if (!matchId) {
        const { data: matches } = await supabase
          .from('matches').select('id').eq('lost_item_id', proofItem.lostItem.id)
          .order('created_at', { ascending: false }).limit(1);
        if (!matches?.[0]) throw new Error('Match not found. Please contact the SDFO.');
        matchId = matches[0].id;
      }

      const { data: existing } = await supabase
        .from('claims').select('id').eq('match_id', matchId).maybeSingle();

      let error;
      if (existing) {
        ({ error } = await supabase.from('claims').update({
          proof_photos: uploadedUrls,
          proof_description: proofDescription.trim(),
          status: 'proof_submitted',
        }).eq('id', existing.id));
      } else {
        ({ error } = await supabase.from('claims').insert({
          match_id: matchId,
          claimant_id: user.id,
          proof_photos: uploadedUrls,
          proof_description: proofDescription.trim(),
          status: 'proof_submitted',
        }));
      }

      if (error) throw error;

      const { data: admins } = await supabase.from('users').select('id').eq('role', 'admin');
      if (admins && admins.length > 0) {
        await supabase.from('notifications').insert(
          admins.map((a: any) => ({
            user_id: a.id,
            type: 'proof_submitted',
            message: `A student submitted proof of ownership for "${proofItem.lostItem.name}". Please review in the Claims tab.`,
          }))
        );
      }

      Alert.alert('Proof Submitted!', 'Your proof of ownership has been sent to the admin for review.');
      setProofItem(null);
      fetchData();
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Something went wrong. Please try again.');
    } finally {
      setProofSubmitting(false);
    }
  };

  const handleMarkResolved = async (item: LostItem) => {
    Alert.alert('Confirm Pickup', 'Have you physically received your item from SDFO?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Yes, I have it',
        onPress: async () => {
          const { data: matches } = await supabase
            .from('matches').select('id, found_report_id').eq('lost_item_id', item.id)
            .order('created_at', { ascending: false }).limit(1);
          const match = matches?.[0];
          if (!match) return;
          await Promise.all([
            supabase.from('lost_items').update({ status: 'resolved' }).eq('id', item.id),
            supabase.from('matches').update({ status: 'resolved' }).eq('id', match.id),
            supabase.from('found_reports').update({ status: 'resolved' }).eq('id', match.found_report_id),
          ]);
          Alert.alert('Resolved!', 'Great! Your case has been marked as resolved.');
          fetchData();
        },
      },
    ]);
  };

  const s = StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.background },
    header: {
      paddingHorizontal: Spacing.xl, paddingVertical: Spacing.lg,
      backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border,
    },
    headerTitle: { fontSize: 22, fontWeight: '800', color: colors.text },
    tabs: {
      flexDirection: 'row', margin: Spacing.xl, backgroundColor: colors.gray100,
      borderRadius: Radius.md, padding: 4,
    },
    tabBtn: { flex: 1, paddingVertical: Spacing.sm, borderRadius: Radius.sm - 2, alignItems: 'center' },
    tabText: { fontSize: 14, fontWeight: '600' },
    card: {
      marginHorizontal: Spacing.xl, marginBottom: Spacing.md,
      backgroundColor: colors.surface, borderRadius: Radius.lg,
      borderWidth: 1, borderColor: colors.border, overflow: 'hidden',
    },
    cardTop: { flexDirection: 'row', padding: Spacing.lg, gap: Spacing.md },
    thumb: { width: 64, height: 64, borderRadius: Radius.sm, backgroundColor: colors.gray100 },
    cardInfo: { flex: 1 },
    cardName: { fontSize: 15, fontWeight: '700', color: colors.text, marginBottom: 4 },
    badge: { alignSelf: 'flex-start', paddingHorizontal: Spacing.sm, paddingVertical: 3, borderRadius: Radius.full, marginBottom: Spacing.sm },
    badgeText: { fontSize: 11, fontWeight: '700', color: '#fff' },
    meta: { flexDirection: 'row', gap: Spacing.md },
    metaItem: { flexDirection: 'row', alignItems: 'center', gap: 3 },
    metaText: { fontSize: 11, color: colors.textSecondary },
    stepBar: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.md },
    stepRow: { flexDirection: 'row', alignItems: 'center' },
    stepDot: { width: 10, height: 10, borderRadius: 5 },
    stepLine: { flex: 1, height: 2 },
    stepLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
    stepLabel: { fontSize: 9, fontWeight: '600', flex: 1, textAlign: 'center' },
    rejectionBox: {
      flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm,
      backgroundColor: '#FEE2E2', padding: Spacing.md,
      borderTopWidth: 1, borderTopColor: '#FECACA',
    },
    rejectionText: { fontSize: 12, color: '#991B1B', flex: 1, lineHeight: 18 },
    editRow: { flexDirection: 'row', gap: Spacing.sm, padding: Spacing.md, paddingTop: 0 },
    editBtn: { flex: 1, paddingVertical: Spacing.sm, borderRadius: Radius.sm, alignItems: 'center', borderWidth: 1 },
    editBtnText: { fontSize: 13, fontWeight: '600' },
    empty: { alignItems: 'center', marginTop: 60, gap: Spacing.md },
    emptyText: { fontSize: 16, fontWeight: '700', color: colors.text },
    emptySub: { fontSize: 13, color: colors.textSecondary },
    actionBtn: {
      margin: Spacing.md, marginTop: 0,
      borderRadius: Radius.sm, paddingVertical: Spacing.sm, alignItems: 'center',
    },
    actionBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
    pendingProofBox: {
      flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
      backgroundColor: '#EFF6FF', margin: Spacing.md, marginTop: 0,
      padding: Spacing.sm, borderRadius: Radius.sm, borderWidth: 1, borderColor: '#BFDBFE',
    },
    pendingProofText: { fontSize: 12, color: '#1D4ED8', flex: 1, fontWeight: '600' },
    // ✅ Found report photo viewer
    photoStrip: { flexDirection: 'row', gap: Spacing.sm, paddingHorizontal: Spacing.lg, paddingBottom: Spacing.md },
    photoThumb: { width: 72, height: 72, borderRadius: Radius.sm, backgroundColor: colors.gray100 },
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
    sheet: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl, maxHeight: '90%',
    },
    sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginTop: Spacing.md },
    sheetHeader: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: Spacing.xl, paddingVertical: Spacing.lg,
      borderBottomWidth: 1, borderBottomColor: colors.border,
    },
    sheetTitle: { fontSize: 17, fontWeight: '800', color: colors.text },
    sheetScroll: { padding: Spacing.xl },
    sheetLabel: { fontSize: 13, fontWeight: '600', color: colors.text, marginBottom: Spacing.sm, marginTop: Spacing.md },
    sheetInput: {
      backgroundColor: colors.gray100, borderRadius: Radius.md, padding: Spacing.md,
      fontSize: 14, color: colors.text, borderWidth: 1, borderColor: colors.border,
      minHeight: 80, textAlignVertical: 'top',
    },
    photoRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginBottom: Spacing.sm },
    photoWrap: { position: 'relative', width: 80, height: 80 },
    photo: { width: 80, height: 80, borderRadius: Radius.sm },
    removePhoto: {
      position: 'absolute', top: -6, right: -6, backgroundColor: colors.error,
      borderRadius: 10, width: 20, height: 20, alignItems: 'center', justifyContent: 'center',
    },
    addPhoto: {
      width: 80, height: 80, borderRadius: Radius.sm, borderWidth: 2,
      borderStyle: 'dashed', borderColor: colors.border, alignItems: 'center', justifyContent: 'center', gap: 4,
    },
    addPhotoText: { fontSize: 10, color: colors.textSecondary },
    submitBtn: {
      backgroundColor: colors.primary, borderRadius: Radius.md,
      paddingVertical: 14, alignItems: 'center', marginTop: Spacing.xl, marginBottom: Spacing.xxxl,
    },
    submitBtnDisabled: { opacity: 0.5 },
    submitBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
    infoBox: { backgroundColor: colors.primaryMuted, borderRadius: Radius.md, padding: Spacing.md, marginBottom: Spacing.md },
    infoText: { fontSize: 13, color: colors.primary, lineHeight: 20 },
  });

  const renderLost = ({ item }: { item: LostItem }) => {
    const st = LOST_STATUS[item.status] || LOST_STATUS.searching;
    const step = st.step;
    const proofAlreadySubmitted = proofSubmittedIds.has(item.id);

    return (
      <View style={s.card}>
        <View style={s.cardTop}>
          {item.photos?.[0]
            ? <Image source={{ uri: item.photos[0] }} style={s.thumb} resizeMode="cover" />
            : <View style={[s.thumb, { alignItems: 'center', justifyContent: 'center' }]}><Text style={{ fontSize: 28 }}>📦</Text></View>
          }
          <View style={s.cardInfo}>
            <Text style={s.cardName} numberOfLines={1}>{item.name}</Text>
            <View style={[s.badge, { backgroundColor: st.color }]}>
              <Text style={s.badgeText}>{st.label}</Text>
            </View>
            <View style={s.meta}>
              <View style={s.metaItem}>
                <MapPin size={11} color={colors.textMuted} />
                <Text style={s.metaText} numberOfLines={1}>{item.location}</Text>
              </View>
              <View style={s.metaItem}>
                <Calendar size={11} color={colors.textMuted} />
                <Text style={s.metaText}>{new Date(item.created_at).toLocaleDateString()}</Text>
              </View>
            </View>
          </View>
        </View>

        {item.status !== 'expired' && item.status !== 'resolved' && (
          <View style={s.stepBar}>
            <View style={s.stepRow}>
              {LOST_STEPS.map((_, i) => (
                <View key={i} style={{ flexDirection: 'row', alignItems: 'center', flex: i < LOST_STEPS.length - 1 ? 1 : 0 }}>
                  <View style={[s.stepDot, { backgroundColor: i <= step ? colors.primary : colors.border }]} />
                  {i < LOST_STEPS.length - 1 && <View style={[s.stepLine, { backgroundColor: i < step ? colors.primary : colors.border }]} />}
                </View>
              ))}
            </View>
            <View style={s.stepLabels}>
              {LOST_STEPS.map((l, i) => (
                <Text key={i} style={[s.stepLabel, { color: i <= step ? colors.primary : colors.textMuted }]}>{l}</Text>
              ))}
            </View>
          </View>
        )}

        {item.status === 'possible_match' && (
          proofAlreadySubmitted ? (
            <View style={s.pendingProofBox}>
              <CheckCircle size={14} color="#1D4ED8" />
              <Text style={s.pendingProofText}>Proof submitted — awaiting admin review</Text>
            </View>
          ) : (
            <TouchableOpacity style={[s.actionBtn, { backgroundColor: '#3B82F6' }]} onPress={() => openProofModal(item)}>
              <Text style={s.actionBtnText}>Upload Proof of Ownership</Text>
            </TouchableOpacity>
          )
        )}

        {item.status === 'ready_for_claiming' && (
          <TouchableOpacity style={[s.actionBtn, { backgroundColor: '#10B981' }]} onPress={() => handleMarkResolved(item)}>
            <Text style={s.actionBtnText}>I've Received My Item — Mark Resolved</Text>
          </TouchableOpacity>
        )}

        {item.status === 'searching' && (
          <View style={s.editRow}>
            <TouchableOpacity style={[s.editBtn, { borderColor: colors.border }]}>
              <Text style={[s.editBtnText, { color: colors.text }]}>Edit</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.editBtn, { borderColor: '#FECACA', backgroundColor: '#FEF2F2' }]}
              onPress={async () => { await supabase.from('lost_items').delete().eq('id', item.id); fetchData(); }}
            >
              <Text style={[s.editBtnText, { color: colors.error }]}>Delete</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  const renderFound = ({ item }: { item: FoundReport }) => {
    const st = FOUND_STATUS[item.status] || FOUND_STATUS.pending_review;
    return (
      <View style={s.card}>
        <View style={s.cardTop}>
          {item.photos?.[0]
            ? <Image source={{ uri: item.photos[0] }} style={s.thumb} resizeMode="cover" />
            : <View style={[s.thumb, { alignItems: 'center', justifyContent: 'center' }]}><Text style={{ fontSize: 28 }}>🔍</Text></View>
          }
          <View style={s.cardInfo}>
            <Text style={s.cardName} numberOfLines={2}>{item.item_description}</Text>
            <View style={[s.badge, { backgroundColor: st.color }]}>
              <Text style={s.badgeText}>{st.label}</Text>
            </View>
            <View style={s.meta}>
              <View style={s.metaItem}>
                <MapPin size={11} color={colors.textMuted} />
                <Text style={s.metaText}>{item.location}</Text>
              </View>
              <View style={s.metaItem}>
                <Calendar size={11} color={colors.textMuted} />
                <Text style={s.metaText}>{new Date(item.created_at).toLocaleDateString()}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* ✅ Show photos strip for found reports */}
        {item.photos && item.photos.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.photoStrip}>
            {item.photos.map((url, i) => (
              <Image key={i} source={{ uri: url }} style={s.photoThumb} resizeMode="cover" />
            ))}
          </ScrollView>
        )}

        {item.status === 'rejected' && item.rejection_reason && (
          <View style={s.rejectionBox}>
            <AlertCircle size={16} color="#991B1B" />
            <Text style={s.rejectionText}>Rejected: {item.rejection_reason}</Text>
          </View>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <Text style={s.headerTitle}>My Activity</Text>
      </View>

      <View style={s.tabs}>
        <TouchableOpacity
          style={[s.tabBtn, { backgroundColor: tab === 'lost' ? colors.surface : 'transparent' }]}
          onPress={() => setTab('lost')}
        >
          <Text style={[s.tabText, { color: tab === 'lost' ? colors.primary : colors.textSecondary }]}>My Lost Posts</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.tabBtn, { backgroundColor: tab === 'found' ? colors.surface : 'transparent' }]}
          onPress={() => setTab('found')}
        >
          <Text style={[s.tabText, { color: tab === 'found' ? colors.primary : colors.textSecondary }]}>My Found Reports</Text>
        </TouchableOpacity>
      </View>

      {loading ? <ActivityIndicator color={colors.primary} style={{ marginTop: 60 }} size="large" /> : (
        tab === 'lost' ? (
          <FlatList
            data={lostItems}
            keyExtractor={i => i.id}
            renderItem={renderLost}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 80, paddingTop: Spacing.sm }}
            ListEmptyComponent={
              <View style={s.empty}>
                <Text style={{ fontSize: 48 }}>📋</Text>
                <Text style={s.emptyText}>No lost posts yet</Text>
                <Text style={s.emptySub}>Post a lost item from Home</Text>
              </View>
            }
          />
        ) : (
          <FlatList
            data={foundReports}
            keyExtractor={i => i.id}
            renderItem={renderFound}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 80, paddingTop: Spacing.sm }}
            ListEmptyComponent={
              <View style={s.empty}>
                <Text style={{ fontSize: 48 }}>🔍</Text>
                <Text style={s.emptyText}>No found reports yet</Text>
                <Text style={s.emptySub}>Submit a found report when you find something</Text>
              </View>
            }
          />
        )
      )}

      <Modal visible={!!proofItem} animationType="slide" transparent onRequestClose={() => setProofItem(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <View style={s.overlay}>
            <View style={s.sheet}>
              <View style={s.sheetHandle} />
              <View style={s.sheetHeader}>
                <Text style={s.sheetTitle}>Proof of Ownership</Text>
                <TouchableOpacity onPress={() => setProofItem(null)}>
                  <X size={22} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>
              <ScrollView style={s.sheetScroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                <View style={s.infoBox}>
                  <Text style={s.infoText}>
                    Upload photos and a description proving this item belongs to you (e.g., receipt, serial number, unique markings).
                    The admin will review and approve before you can claim your item.
                  </Text>
                </View>

                <Text style={s.sheetLabel}>Proof Photos <Text style={{ color: colors.error }}>*</Text></Text>
                <View style={s.photoRow}>
                  {proofPhotos.map((uri, i) => (
                    <View key={i} style={s.photoWrap}>
                      <Image source={{ uri }} style={s.photo} resizeMode="cover" />
                      <TouchableOpacity style={s.removePhoto} onPress={() => setProofPhotos(p => p.filter((_, j) => j !== i))}>
                        <X size={12} color="#fff" />
                      </TouchableOpacity>
                    </View>
                  ))}
                  {proofPhotos.length < 3 && (
                    <TouchableOpacity style={s.addPhoto} onPress={pickProofPhoto}>
                      <Camera size={22} color={colors.textMuted} />
                      <Text style={s.addPhotoText}>Add Photo</Text>
                    </TouchableOpacity>
                  )}
                </View>
                <Text style={{ fontSize: 11, color: colors.textMuted, marginBottom: Spacing.md }}>
                  {proofPhotos.length}/3 photos
                </Text>

                <Text style={s.sheetLabel}>Ownership Description <Text style={{ color: colors.error }}>*</Text></Text>
                <TextInput
                  style={s.sheetInput}
                  placeholder="Describe how you can prove this item is yours..."
                  placeholderTextColor={colors.textMuted}
                  value={proofDescription}
                  onChangeText={setProofDescription}
                  multiline
                />

                <TouchableOpacity
                  style={[s.submitBtn, proofSubmitting && s.submitBtnDisabled]}
                  onPress={submitProof}
                  disabled={proofSubmitting}
                >
                  <Text style={s.submitBtnText}>
                    {proofSubmitting ? 'Submitting...' : 'Submit Proof of Ownership'}
                  </Text>
                </TouchableOpacity>
              </ScrollView>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}