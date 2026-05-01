import { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  RefreshControl, ActivityIndicator, Image, Modal, ScrollView,
  TextInput, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { MapPin, Calendar, AlertCircle, Camera, X, CheckCircle, ChevronLeft, ChevronRight } from 'lucide-react-native';
import { useTheme } from '../../lib/ThemeContext';
import { supabase } from '../../lib/supabase';
import { Spacing, Radius } from '../../constants/theme';
import PhotoViewerModal from '../../components/PhotoViewerModal';
import type { LostItem, FoundReport } from '../../types';

const FOUND_BUCKET = 'found-items';

const LOST_STATUS: Record<string, { label: string; color: string; step: number }> = {
  searching: { label: 'Searching', color: '#F59E0B', step: 0 },
  possible_match: { label: 'Match Found', color: '#3B82F6', step: 1 },
  ready_for_claiming: { label: 'Ready to Claim', color: '#10B981', step: 2 },
  resolved: { label: 'Resolved', color: '#6B7280', step: 3 },
  expired: { label: 'Expired', color: '#EF4444', step: 3 },
};

const FOUND_STATUS: Record<string, { label: string; color: string }> = {
  pending_review: { label: 'Pending Review', color: '#F59E0B' },
  approved: { label: 'Approved', color: '#10B981' },
  waiting_submission: { label: 'Waiting Submission', color: '#3B82F6' },
  submitted_to_sdfo: { label: 'Submitted to SDFO', color: '#8B5CF6' },
  matched_to_owner: { label: 'Matched to Owner', color: '#06B6D4' },
  resolved: { label: 'Resolved', color: '#6B7280' },
  rejected: { label: 'Rejected', color: '#EF4444' },
};

const LOST_STEPS = ['Searching', 'Match Found', 'Ready to Claim', 'Resolved'];

type ProofItem = { lostItem: LostItem; matchId: string };
type SelectedReport =
  | { kind: 'lost'; item: LostItem }
  | { kind: 'found'; item: FoundReport }
  | null;

const resolvePhotoUrl = (uri: string): string => {
  if (!uri || uri.startsWith('http')) return uri;
  return supabase.storage.from(FOUND_BUCKET).getPublicUrl(uri).data.publicUrl;
};

export default function ActivityScreen() {
  const { colors } = useTheme();
  const { tab: tabParam, lostId, foundId } = useLocalSearchParams<{ tab?: string; lostId?: string; foundId?: string }>();
  const [tab, setTab] = useState<'lost' | 'found'>(tabParam === 'found' ? 'found' : 'lost');
  const autoOpenedTarget = useRef<string | null>(null);
  const [lostItems, setLostItems] = useState<LostItem[]>([]);
  const [foundReports, setFoundReports] = useState<FoundReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedReport, setSelectedReport] = useState<SelectedReport>(null);
  const [detailPhotoIndex, setDetailPhotoIndex] = useState(0);
  const [photoViewerVisible, setPhotoViewerVisible] = useState(false);

  const [proofItem, setProofItem] = useState<ProofItem | null>(null);
  const [proofPhotos, setProofPhotos] = useState<string[]>([]);
  const [proofDescription, setProofDescription] = useState('');
  const [proofSubmitting, setProofSubmitting] = useState(false);
  const [proofSubmittedIds, setProofSubmittedIds] = useState<Set<string>>(new Set());

  const detailMediaHeight = 240;

  useEffect(() => {
    if (tabParam === 'found') setTab('found');
    if (tabParam === 'lost') setTab('lost');
  }, [tabParam]);

  const fetchData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }

    const [lost, found] = await Promise.all([
      supabase.from('lost_items').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
      supabase.from('found_reports').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
    ]);

    const lostData: LostItem[] = lost.data || [];
    setLostItems(lostData);
    setFoundReports(found.data || []);

    const possibleMatchIds = lostData.filter((item) => item.status === 'possible_match').map((item) => item.id);

    if (possibleMatchIds.length === 0) {
      setProofSubmittedIds(new Set());
      setLoading(false);
      return;
    }

    const { data: matches } = await supabase
      .from('matches')
      .select('id, lost_item_id')
      .in('lost_item_id', possibleMatchIds);

    if (!matches || matches.length === 0) {
      setProofSubmittedIds(new Set());
      setLoading(false);
      return;
    }

    const matchIds = matches.map((match: any) => match.id);
    const { data: claims } = await supabase
      .from('claims')
      .select('match_id')
      .in('match_id', matchIds)
      .not('proof_photos', 'is', null);

    if (!claims || claims.length === 0) {
      setProofSubmittedIds(new Set());
      setLoading(false);
      return;
    }

    const submittedMatchIds = new Set(claims.map((claim: any) => claim.match_id));
    const submittedLostIds = new Set(
      (matches as any[])
        .filter((match: any) => submittedMatchIds.has(match.id))
        .map((match: any) => match.lost_item_id)
    );

    setProofSubmittedIds(submittedLostIds as Set<string>);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [fetchData])
  );

  useEffect(() => {
    if (lostId) {
      const targetKey = `lost:${lostId}`;
      if (autoOpenedTarget.current === targetKey) return;

      const match = lostItems.find((item) => item.id === lostId);
      if (match) {
        autoOpenedTarget.current = targetKey;
        setTab('lost');
        setDetailPhotoIndex(0);
        setSelectedReport({ kind: 'lost', item: match });
      }
      return;
    }

    if (foundId) {
      const targetKey = `found:${foundId}`;
      if (autoOpenedTarget.current === targetKey) return;

      const match = foundReports.find((item) => item.id === foundId);
      if (match) {
        autoOpenedTarget.current = targetKey;
        setTab('found');
        setDetailPhotoIndex(0);
        setSelectedReport({ kind: 'found', item: match });
      }
    }
  }, [foundId, foundReports, lostId, lostItems]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  };

  const openProofModal = async (item: LostItem) => {
    const { data: matches } = await supabase
      .from('matches')
      .select('id')
      .eq('lost_item_id', item.id)
      .order('created_at', { ascending: false })
      .limit(1);

    const match = matches?.[0];
    if (!match) return Alert.alert('Not Ready', 'No match has been created yet. Please wait for the admin.');

    setProofItem({ lostItem: item, matchId: match.id });
    setProofPhotos([]);
    setProofDescription('');
  };

  const pickProofPhoto = async () => {
    if (proofPhotos.length >= 3) return Alert.alert('Max 3 photos for proof');
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (!result.canceled) setProofPhotos((current) => [...current, result.assets[0].uri]);
  };

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
        for (let i = 0; i < byteChars.length; i += 1) byteArray[i] = byteChars.charCodeAt(i);

        const { error: uploadError } = await supabase.storage
          .from(FOUND_BUCKET)
          .upload(path, byteArray, { contentType: `image/${ext}`, upsert: true });

        if (uploadError) continue;

        const { data: urlData } = supabase.storage.from(FOUND_BUCKET).getPublicUrl(path);
        if (urlData?.publicUrl) urls.push(urlData.publicUrl);
      } catch {
        continue;
      }
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
          .from('matches')
          .select('id')
          .eq('lost_item_id', proofItem.lostItem.id)
          .order('created_at', { ascending: false })
          .limit(1);
        if (!matches?.[0]) throw new Error('Match not found. Please contact the SDFO.');
        matchId = matches[0].id;
      }

      const { data: existing } = await supabase
        .from('claims')
        .select('id')
        .eq('match_id', matchId)
        .maybeSingle();

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
          admins.map((admin: any) => ({
            user_id: admin.id,
            type: 'proof_submitted',
            message: `A student submitted proof of ownership for "${proofItem.lostItem.name}". Please review in the Claims tab.`,
          }))
        );
      }

      Alert.alert('Proof Submitted', 'Your proof of ownership has been sent to the admin for review.');
      setProofItem(null);
      fetchData();
    } catch (error: any) {
      Alert.alert('Error', error?.message ?? 'Something went wrong. Please try again.');
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
            .from('matches')
            .select('id, found_report_id')
            .eq('lost_item_id', item.id)
            .order('created_at', { ascending: false })
            .limit(1);

          const match = matches?.[0];
          if (!match) return;

          await Promise.all([
            supabase.from('lost_items').update({ status: 'resolved' }).eq('id', item.id),
            supabase.from('matches').update({ status: 'resolved' }).eq('id', match.id),
            supabase.from('found_reports').update({ status: 'resolved' }).eq('id', match.found_report_id),
          ]);

          if (selectedReport?.kind === 'lost' && selectedReport.item.id === item.id) {
            setSelectedReport(null);
            setPhotoViewerVisible(false);
          }

          Alert.alert('Resolved', 'Great! Your case has been marked as resolved.');
          fetchData();
        },
      },
    ]);
  };

  const confirmDeleteLostItem = (item: LostItem) => {
    Alert.alert('Delete Post?', `Delete "${item.name}" from your activity?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await supabase.from('lost_items').delete().eq('id', item.id);
          if (selectedReport?.kind === 'lost' && selectedReport.item.id === item.id) {
            setSelectedReport(null);
            setPhotoViewerVisible(false);
          }
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
    thumbWrap: {
      width: 72,
      height: 72,
      borderRadius: Radius.sm,
      backgroundColor: colors.gray100,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    thumb: { width: '100%', height: '100%' },
    cardInfo: { flex: 1 },
    cardName: { fontSize: 15, fontWeight: '700', color: colors.text, marginBottom: 4 },
    badge: { alignSelf: 'flex-start', paddingHorizontal: Spacing.sm, paddingVertical: 3, borderRadius: Radius.full, marginBottom: Spacing.sm },
    badgeText: { fontSize: 11, fontWeight: '700', color: '#fff' },
    meta: { flexDirection: 'row', gap: Spacing.md },
    metaItem: { flexDirection: 'row', alignItems: 'center', gap: 3, flex: 1 },
    metaText: { fontSize: 11, color: colors.textSecondary, flexShrink: 1 },
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
    empty: { alignItems: 'center', justifyContent: 'center', flex: 1, gap: Spacing.md, paddingHorizontal: Spacing.xl },
    emptyText: { fontSize: 16, fontWeight: '700', color: colors.text, textAlign: 'center' },
    emptySub: { fontSize: 13, color: colors.textSecondary, textAlign: 'center' },
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
    photoStrip: { flexDirection: 'row', gap: Spacing.sm, paddingHorizontal: Spacing.lg, paddingBottom: Spacing.md },
    photoThumb: { width: 72, height: 72, borderRadius: Radius.sm, backgroundColor: colors.gray100 },
    detailOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
    detailSheet: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: Radius.xl,
      borderTopRightRadius: Radius.xl,
      maxHeight: '90%',
    },
    detailHandle: {
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.border,
      alignSelf: 'center',
      marginTop: Spacing.md,
    },
    detailCloseBtn: {
      position: 'absolute',
      top: Spacing.lg,
      right: Spacing.lg,
      zIndex: 10,
    },
    detailScroll: { paddingBottom: Spacing.xl },
    detailMediaWrap: {
      overflow: 'hidden',
      alignItems: 'center',
      justifyContent: 'center',
    },
    detailMedia: { width: '100%', height: '100%' },
    detailCard: {
      padding: Spacing.xl,
    },
    detailTitleRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: Spacing.sm,
      marginBottom: Spacing.md,
    },
    detailName: { flex: 1, fontSize: 24, fontWeight: '800', color: colors.text },
    detailMeta: { gap: Spacing.sm, marginBottom: Spacing.lg },
    detailMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    detailMetaText: { fontSize: 14, color: colors.textSecondary, flexShrink: 1 },
    sectionLabel: {
      fontSize: 12,
      fontWeight: '700',
      letterSpacing: 0.4,
      textTransform: 'uppercase',
      color: colors.textMuted,
      marginBottom: 6,
    },
    detailDescription: { fontSize: 15, lineHeight: 24, color: colors.text, marginBottom: Spacing.lg },
    tapHintWrap: {
      position: 'absolute',
      bottom: Spacing.sm,
      alignSelf: 'center',
      backgroundColor: 'rgba(0,0,0,0.45)',
      borderRadius: Radius.full,
      paddingHorizontal: Spacing.md,
      paddingVertical: 6,
    },
    tapHintText: { color: '#fff', fontSize: 12, fontWeight: '600' },
    detailDots: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginBottom: Spacing.md },
    detailDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(0,0,0,0.2)' },
    detailDotActive: { width: 16, backgroundColor: colors.primary },
    navBtn: {
      position: 'absolute',
      top: '45%',
      backgroundColor: 'rgba(0,0,0,0.35)',
      borderRadius: 20,
      padding: 6,
    },
    infoBox: {
      backgroundColor: colors.primaryMuted,
      borderRadius: Radius.md,
      padding: Spacing.md,
      marginBottom: Spacing.lg,
    },
    infoText: { fontSize: 13, color: colors.primary, lineHeight: 20 },
    detailActionRow: { flexDirection: 'row', gap: Spacing.md },
    secondaryAction: {
      flex: 1,
      borderRadius: Radius.md,
      paddingVertical: 14,
      alignItems: 'center',
      borderWidth: 1,
    },
    secondaryActionText: { fontSize: 14, fontWeight: '600' },
    dangerAction: { backgroundColor: '#FEF2F2', borderColor: '#FECACA' },
    primaryAction: {
      borderRadius: Radius.md,
      paddingVertical: 16,
      alignItems: 'center',
      marginTop: Spacing.sm,
    },
    primaryActionText: { color: '#fff', fontSize: 15, fontWeight: '700' },
    detailInfoBanner: {
      backgroundColor: '#EFF6FF',
      borderWidth: 1,
      borderColor: '#BFDBFE',
      borderRadius: Radius.md,
      padding: Spacing.md,
      marginTop: Spacing.sm,
    },
    detailInfoBannerText: { color: '#1D4ED8', fontSize: 14, fontWeight: '600', textAlign: 'center' },
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
    emptyMediaText: { fontSize: 14, fontWeight: '600', color: colors.textMuted },
  });

  const renderLost = ({ item }: { item: LostItem }) => {
    const status = LOST_STATUS[item.status] || LOST_STATUS.searching;
    const step = status.step;
    const proofAlreadySubmitted = proofSubmittedIds.has(item.id);

    return (
      <TouchableOpacity style={s.card} activeOpacity={0.92} onPress={() => { setSelectedReport({ kind: 'lost', item }); setDetailPhotoIndex(0); }}>
        <View style={s.cardTop}>
          <View style={s.thumbWrap}>
            {item.photos?.[0] ? (
              <Image source={{ uri: item.photos[0] }} style={s.thumb} resizeMode="cover" />
            ) : (
              <Text style={s.emptyMediaText}>No image</Text>
            )}
          </View>
          <View style={s.cardInfo}>
            <Text style={s.cardName} numberOfLines={1}>{item.name}</Text>
            <View style={[s.badge, { backgroundColor: status.color }]}>
              <Text style={s.badgeText}>{status.label}</Text>
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

        {item.status !== 'expired' && item.status !== 'resolved' ? (
          <View style={s.stepBar}>
            <View style={s.stepRow}>
              {LOST_STEPS.map((_, index) => (
                <View key={index} style={{ flexDirection: 'row', alignItems: 'center', flex: index < LOST_STEPS.length - 1 ? 1 : 0 }}>
                  <View style={[s.stepDot, { backgroundColor: index <= step ? colors.primary : colors.border }]} />
                  {index < LOST_STEPS.length - 1 ? <View style={[s.stepLine, { backgroundColor: index < step ? colors.primary : colors.border }]} /> : null}
                </View>
              ))}
            </View>
            <View style={s.stepLabels}>
              {LOST_STEPS.map((label, index) => (
                <Text key={index} style={[s.stepLabel, { color: index <= step ? colors.primary : colors.textMuted }]}>{label}</Text>
              ))}
            </View>
          </View>
        ) : null}

        {item.status === 'possible_match' ? (
          proofAlreadySubmitted ? (
            <View style={s.pendingProofBox}>
              <CheckCircle size={14} color="#1D4ED8" />
              <Text style={s.pendingProofText}>Proof submitted - awaiting admin review</Text>
            </View>
          ) : (
            <TouchableOpacity style={[s.actionBtn, { backgroundColor: '#3B82F6' }]} onPress={() => openProofModal(item)}>
              <Text style={s.actionBtnText}>Upload Proof of Ownership</Text>
            </TouchableOpacity>
          )
        ) : null}

        {item.status === 'ready_for_claiming' ? (
          <TouchableOpacity style={[s.actionBtn, { backgroundColor: '#10B981' }]} onPress={() => handleMarkResolved(item)}>
            <Text style={s.actionBtnText}>I've Received My Item - Mark Resolved</Text>
          </TouchableOpacity>
        ) : null}

        {item.status === 'searching' ? (
          <View style={s.editRow}>
            <TouchableOpacity
              style={[s.editBtn, { borderColor: colors.border }]}
              onPress={() => router.push({ pathname: '/(student)/post', params: { id: item.id } })}
            >
              <Text style={[s.editBtnText, { color: colors.text }]}>Edit</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.editBtn, { borderColor: '#FECACA', backgroundColor: '#FEF2F2' }]}
              onPress={() => confirmDeleteLostItem(item)}
            >
              <Text style={[s.editBtnText, { color: colors.error }]}>Delete</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </TouchableOpacity>
    );
  };

  const renderFound = ({ item }: { item: FoundReport }) => {
    const status = FOUND_STATUS[item.status] || FOUND_STATUS.pending_review;

    return (
      <TouchableOpacity style={s.card} activeOpacity={0.92} onPress={() => { setSelectedReport({ kind: 'found', item }); setDetailPhotoIndex(0); }}>
        <View style={s.cardTop}>
          <View style={s.thumbWrap}>
            {item.photos?.[0] ? (
              <Image source={{ uri: resolvePhotoUrl(item.photos[0]) }} style={s.thumb} resizeMode="cover" />
            ) : (
              <Text style={s.emptyMediaText}>No image</Text>
            )}
          </View>
          <View style={s.cardInfo}>
            <Text style={s.cardName} numberOfLines={2}>{item.item_description}</Text>
            <View style={[s.badge, { backgroundColor: status.color }]}>
              <Text style={s.badgeText}>{status.label}</Text>
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

        {item.status === 'rejected' && item.rejection_reason ? (
          <View style={s.rejectionBox}>
            <AlertCircle size={16} color="#991B1B" />
            <Text style={s.rejectionText}>Rejected: {item.rejection_reason}</Text>
          </View>
        ) : null}
      </TouchableOpacity>
    );
  };

  const selectedLostItem = selectedReport?.kind === 'lost' ? selectedReport.item : null;
  const selectedFoundReport = selectedReport?.kind === 'found' ? selectedReport.item : null;
  const selectedPhotos = selectedReport?.kind === 'found'
    ? (selectedReport.item.photos ?? []).map(resolvePhotoUrl)
    : (selectedReport?.item.photos ?? []);

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
            keyExtractor={(item) => item.id}
            renderItem={renderLost}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={lostItems.length === 0 ? { flexGrow: 1, paddingTop: Spacing.sm, paddingBottom: Spacing.lg } : { paddingTop: Spacing.sm, paddingBottom: Spacing.lg }}
            ListEmptyComponent={(
              <View style={s.empty}>
                <Text style={s.emptyText}>No lost posts yet</Text>
                <Text style={s.emptySub}>Post a lost item from Home</Text>
              </View>
            )}
          />
        ) : (
          <FlatList
            data={foundReports}
            keyExtractor={(item) => item.id}
            renderItem={renderFound}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={foundReports.length === 0 ? { flexGrow: 1, paddingTop: Spacing.sm, paddingBottom: Spacing.lg } : { paddingTop: Spacing.sm, paddingBottom: Spacing.lg }}
            ListEmptyComponent={(
              <View style={s.empty}>
                <Text style={s.emptyText}>No found reports yet</Text>
                <Text style={s.emptySub}>Submit a found report when you find something</Text>
              </View>
            )}
          />
        )
      )}

      <Modal
        visible={!!selectedReport}
        transparent
        animationType="slide"
        statusBarTranslucent
        presentationStyle="overFullScreen"
        onRequestClose={() => setSelectedReport(null)}
      >
        <TouchableOpacity style={s.detailOverlay} activeOpacity={1} onPress={() => setSelectedReport(null)}>
          <TouchableOpacity activeOpacity={1} style={s.detailSheet}>
            <View style={s.detailHandle} />
            <TouchableOpacity style={s.detailCloseBtn} onPress={() => setSelectedReport(null)}>
              <X size={22} color={colors.textSecondary} />
            </TouchableOpacity>

            {selectedReport ? (
              <ScrollView contentContainerStyle={s.detailScroll} showsVerticalScrollIndicator={false}>
                <TouchableOpacity
                  style={[s.detailMediaWrap, { backgroundColor: colors.gray100, height: detailMediaHeight }]}
                  onPress={() => setPhotoViewerVisible(true)}
                  activeOpacity={0.92}
                >
                  {selectedPhotos.length > 0 ? (
                    <>
                      <Image source={{ uri: selectedPhotos[detailPhotoIndex] }} style={s.detailMedia} resizeMode="cover" />
                      {selectedPhotos.length > 1 ? (
                        <>
                          {detailPhotoIndex > 0 ? (
                            <TouchableOpacity style={[s.navBtn, { left: Spacing.md }]} onPress={() => setDetailPhotoIndex((current) => current - 1)}>
                              <ChevronLeft size={20} color="#fff" />
                            </TouchableOpacity>
                          ) : null}
                          {detailPhotoIndex < selectedPhotos.length - 1 ? (
                            <TouchableOpacity style={[s.navBtn, { right: Spacing.md }]} onPress={() => setDetailPhotoIndex((current) => current + 1)}>
                              <ChevronRight size={20} color="#fff" />
                            </TouchableOpacity>
                          ) : null}
                        </>
                      ) : null}
                      <View style={s.tapHintWrap}>
                        <Text style={s.tapHintText}>Tap image to view full photo</Text>
                      </View>
                    </>
                  ) : (
                    <Text style={s.emptyMediaText}>No image uploaded</Text>
                  )}
                </TouchableOpacity>

                {selectedPhotos.length > 1 ? (
                  <View style={s.detailDots}>
                    {selectedPhotos.map((_, index) => (
                      <View key={index} style={[s.detailDot, index === detailPhotoIndex && s.detailDotActive]} />
                    ))}
                  </View>
                ) : null}

                <View style={s.detailCard}>
                  {selectedLostItem ? (
                    <>
                      <View style={s.detailTitleRow}>
                        <Text style={s.detailName}>{selectedLostItem.name}</Text>
                        <View style={[s.badge, { backgroundColor: LOST_STATUS[selectedLostItem.status]?.color || '#6B7280' }]}>
                          <Text style={s.badgeText}>{LOST_STATUS[selectedLostItem.status]?.label || 'Searching'}</Text>
                        </View>
                      </View>

                      <View style={s.detailMeta}>
                        <View style={s.detailMetaRow}>
                          <MapPin size={14} color={colors.primary} />
                          <Text style={s.detailMetaText}>{selectedLostItem.location}</Text>
                        </View>
                        <View style={s.detailMetaRow}>
                          <Calendar size={14} color={colors.primary} />
                          <Text style={s.detailMetaText}>{new Date(selectedLostItem.date_time).toLocaleString()}</Text>
                        </View>
                      </View>

                      <Text style={s.sectionLabel}>Description</Text>
                      <Text style={s.detailDescription}>{selectedLostItem.description}</Text>

                      {selectedLostItem.status === 'possible_match' && !proofSubmittedIds.has(selectedLostItem.id) ? (
                        <View style={s.infoBox}>
                          <Text style={s.infoText}>
                            A possible match was found. Upload proof of ownership so the admin can review your claim.
                          </Text>
                        </View>
                      ) : null}

                      {selectedLostItem.status === 'searching' ? (
                        <View style={s.detailActionRow}>
                          <TouchableOpacity
                            style={[s.secondaryAction, { borderColor: colors.border }]}
                            onPress={() => {
                              setSelectedReport(null);
                              router.push({ pathname: '/(student)/post', params: { id: selectedLostItem.id } });
                            }}
                          >
                            <Text style={[s.secondaryActionText, { color: colors.text }]}>Edit Post</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[s.secondaryAction, s.dangerAction]}
                            onPress={() => confirmDeleteLostItem(selectedLostItem)}
                          >
                            <Text style={[s.secondaryActionText, { color: colors.error }]}>Delete</Text>
                          </TouchableOpacity>
                        </View>
                      ) : null}

                      {selectedLostItem.status === 'possible_match' ? (
                        proofSubmittedIds.has(selectedLostItem.id) ? (
                          <View style={s.detailInfoBanner}>
                            <Text style={s.detailInfoBannerText}>Proof already submitted. Please wait for admin review.</Text>
                          </View>
                        ) : (
                          <TouchableOpacity
                            style={[s.primaryAction, { backgroundColor: '#3B82F6' }]}
                            onPress={() => {
                              setSelectedReport(null);
                              openProofModal(selectedLostItem);
                            }}
                          >
                            <Text style={s.primaryActionText}>Upload Proof of Ownership</Text>
                          </TouchableOpacity>
                        )
                      ) : null}

                      {selectedLostItem.status === 'ready_for_claiming' ? (
                        <TouchableOpacity style={[s.primaryAction, { backgroundColor: '#10B981' }]} onPress={() => handleMarkResolved(selectedLostItem)}>
                          <Text style={s.primaryActionText}>I've Received My Item - Mark Resolved</Text>
                        </TouchableOpacity>
                      ) : null}
                    </>
                  ) : null}

                  {selectedFoundReport ? (
                    <>
                      <View style={s.detailTitleRow}>
                        <Text style={s.detailName}>{selectedFoundReport.item_description}</Text>
                        <View style={[s.badge, { backgroundColor: FOUND_STATUS[selectedFoundReport.status]?.color || '#6B7280' }]}>
                          <Text style={s.badgeText}>{FOUND_STATUS[selectedFoundReport.status]?.label || 'Pending Review'}</Text>
                        </View>
                      </View>

                      <View style={s.detailMeta}>
                        <View style={s.detailMetaRow}>
                          <MapPin size={14} color={colors.primary} />
                          <Text style={s.detailMetaText}>{selectedFoundReport.location}</Text>
                        </View>
                        <View style={s.detailMetaRow}>
                          <Calendar size={14} color={colors.primary} />
                          <Text style={s.detailMetaText}>{new Date(selectedFoundReport.date_time).toLocaleString()}</Text>
                        </View>
                      </View>

                      <Text style={s.sectionLabel}>Possession</Text>
                      <Text style={s.detailDescription}>
                        {selectedFoundReport.possession === 'with_student' ? 'Item is still with you.' : 'Item has been submitted to SDFO.'}
                      </Text>

                      {selectedFoundReport.status === 'rejected' && selectedFoundReport.rejection_reason ? (
                        <>
                          <Text style={s.sectionLabel}>Rejection Reason</Text>
                          <Text style={s.detailDescription}>{selectedFoundReport.rejection_reason}</Text>
                        </>
                      ) : null}
                    </>
                  ) : null}
                </View>
              </ScrollView>
            ) : null}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      <Modal visible={!!proofItem} animationType="slide" transparent onRequestClose={() => setProofItem(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' }}>
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
                    Upload photos and a description proving this item belongs to you (for example: receipt, serial number, or unique markings).
                  </Text>
                </View>

                <Text style={s.sheetLabel}>Proof Photos <Text style={{ color: colors.error }}>*</Text></Text>
                <View style={s.photoRow}>
                  {proofPhotos.map((uri, index) => (
                    <View key={index} style={s.photoWrap}>
                      <Image source={{ uri }} style={s.photo} resizeMode="cover" />
                      <TouchableOpacity style={s.removePhoto} onPress={() => setProofPhotos((current) => current.filter((_, i) => i !== index))}>
                        <X size={12} color="#fff" />
                      </TouchableOpacity>
                    </View>
                  ))}
                  {proofPhotos.length < 3 ? (
                    <TouchableOpacity style={s.addPhoto} onPress={pickProofPhoto}>
                      <Camera size={22} color={colors.textMuted} />
                      <Text style={s.addPhotoText}>Add Photo</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
                <Text style={{ fontSize: 11, color: colors.textMuted, marginBottom: Spacing.md }}>{proofPhotos.length}/3 photos</Text>

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
                  <Text style={s.submitBtnText}>{proofSubmitting ? 'Submitting...' : 'Submit Proof of Ownership'}</Text>
                </TouchableOpacity>
              </ScrollView>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <PhotoViewerModal
        visible={photoViewerVisible}
        photos={selectedPhotos}
        index={detailPhotoIndex}
        onClose={() => setPhotoViewerVisible(false)}
        onIndexChange={setDetailPhotoIndex}
      />
    </SafeAreaView>
  );
}
