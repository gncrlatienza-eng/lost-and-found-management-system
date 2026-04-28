import { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  RefreshControl, Modal, ScrollView, Alert, ActivityIndicator,
  TextInput, Image, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Package, Calendar, User, X, Check, Clock,
  ChevronLeft, ChevronRight, FileCheck, AlertCircle, ChevronDown,
} from 'lucide-react-native';
import { supabase } from '../../lib/supabase';
import { useTheme } from '../../lib/ThemeContext';
import { Spacing, Radius } from '../../constants/theme';

interface ClaimRow {
  id: string;
  match_id: string;
  claimant_id: string;
  proof_photos: string[];
  proof_description?: string;
  schedule?: string;
  status: string;
}

interface MatchWithDetails {
  id: string;
  status: string;
  created_at: string;
  lost_item: {
    id: string; name: string; category: string;
    user_id: string; user?: { name: string; contact: string };
  };
  found_report: { id: string; item_description: string; user_id: string; user?: { name: string } };
  claim?: ClaimRow;
}

export default function ClaimsScreen() {
  const { colors, isDark } = useTheme();
  const [matches, setMatches] = useState<MatchWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState<MatchWithDetails | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [proofPhotoIndex, setProofPhotoIndex] = useState(0);
  const [proofImgErrors, setProofImgErrors] = useState<Record<number, boolean>>({});

  // Structured schedule fields
  const [schedMonth, setSchedMonth] = useState('');
  const [schedDay, setSchedDay] = useState('');
  const [schedYear, setSchedYear] = useState('');
  const [schedHour, setSchedHour] = useState('');
  const [schedMinute, setSchedMinute] = useState('');
  const [schedAmPm, setSchedAmPm] = useState<'AM' | 'PM'>('AM');
  const [schedLocation, setSchedLocation] = useState('');
  const [showAmPmModal, setShowAmPmModal] = useState(false);

  const schedDayRef = useRef<TextInput>(null);
  const schedYearRef = useRef<TextInput>(null);
  const schedMinuteRef = useRef<TextInput>(null);

  const clearScheduleFields = () => {
    setSchedMonth(''); setSchedDay(''); setSchedYear('');
    setSchedHour(''); setSchedMinute(''); setSchedAmPm('AM');
    setSchedLocation(''); setShowAmPmModal(false);
  };

  const buildScheduleString = (): string => {
    const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    const mm = parseInt(schedMonth, 10);
    const monthName = mm >= 1 && mm <= 12 ? monthNames[mm - 1] : schedMonth;
    const min = schedMinute.padStart(2, '0');
    return `${monthName} ${schedDay}, ${schedYear} · ${schedHour}:${min} ${schedAmPm} · ${schedLocation.trim()}`;
  };

  const fetchMatches = async () => {
    const { data: matchData } = await supabase
      .from('matches')
      .select('*, lost_item:lost_items(id, name, category, user_id, user:users(name, contact)), found_report:found_reports(id, item_description, user_id, user:users(name))')
      .order('created_at', { ascending: false });

    if (!matchData) { setMatches([]); return; }

    const matchIds = matchData.map((m: any) => m.id);

    const { data: claimData } = await supabase
      .from('claims')
      .select('*')
      .in('match_id', matchIds);

    const combined: MatchWithDetails[] = matchData.map((m: any) => ({
      ...m,
      claim: claimData?.find((c: any) => c.match_id === m.id),
    }));
    setMatches(combined);
  };

  const load = async () => { setLoading(true); await fetchMatches(); setLoading(false); };
  const onRefresh = useCallback(async () => { setRefreshing(true); await fetchMatches(); setRefreshing(false); }, []);
  useEffect(() => { load(); }, []);

  // Approve proof + set schedule
  const handleApproveProof = async () => {
    if (!selected) return;
    if (!schedMonth || !schedDay || !schedYear || !schedHour || !schedMinute || !schedLocation.trim()) {
      return Alert.alert('Required', 'Please fill in all schedule fields (date, time, and location).');
    }
    const scheduleStr = buildScheduleString();
    setActionLoading(true);
    try {
      await Promise.all([
        supabase.from('claims').update({
          status: 'claimed',
          schedule: scheduleStr,
        }).eq('match_id', selected.id),
        supabase.from('lost_items').update({ status: 'ready_for_claiming' }).eq('id', selected.lost_item.id),
        supabase.from('matches').update({ status: 'confirmed' }).eq('id', selected.id),
        supabase.from('notifications').insert({
          user_id: selected.lost_item.user_id,
          type: 'ready_for_claiming',
          message: `Your proof of ownership for "${selected.lost_item.name}" has been approved! You may now claim your item. Schedule: ${scheduleStr}`,
        }),
      ]);
      Alert.alert('Approved!', 'Proof approved. Student has been notified with the claiming schedule.');
      clearScheduleFields();
      setSelected(null); fetchMatches();
    } catch (e: any) { Alert.alert('Error', e.message); }
    setActionLoading(false);
  };

  const handleMarkResolved = async () => {
    if (!selected) return;
    Alert.alert('Mark as Resolved?', 'This will close the case and mark the item as resolved.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Resolve', onPress: async () => {
          setActionLoading(true);
          try {
            const resolveOps: any[] = [
              supabase.from('matches').update({ status: 'resolved' }).eq('id', selected.id),
              supabase.from('lost_items').update({ status: 'resolved' }).eq('id', selected.lost_item.id),
              supabase.from('found_reports').update({ status: 'resolved' }).eq('id', selected.found_report.id),
              supabase.from('notifications').insert({
                user_id: selected.lost_item.user_id, type: 'resolved',
                message: `Your lost item "${selected.lost_item.name}" has been successfully claimed and resolved!`,
              }),
            ];
            if (selected.claim) {
              resolveOps.push(
                supabase.from('claims').update({ status: 'claimed' }).eq('match_id', selected.id)
              );
            }
            await Promise.all(resolveOps);
            Alert.alert('Resolved!', 'Case has been marked as resolved.');
            setSelected(null); fetchMatches();
          } catch (e: any) { Alert.alert('Error', e.message); }
          setActionLoading(false);
        },
      },
    ]);
  };

  const getStatusLabel = (item: MatchWithDetails) => {
    if (item.status === 'resolved') return 'Resolved';
    if (item.status === 'confirmed') return 'Ready to Claim';
    if (item.claim?.status === 'proof_submitted') return 'Proof Submitted';
    return 'Pending';
  };

  const getStatusColor = (item: MatchWithDetails) => {
    if (item.status === 'resolved') return colors.gray500;
    if (item.status === 'confirmed') return colors.success;
    if (item.claim?.status === 'proof_submitted') return '#3B82F6';
    return colors.warning;
  };

  const renderItem = ({ item }: { item: MatchWithDetails }) => {
    const color = getStatusColor(item);
    const label = getStatusLabel(item);
    return (
      <TouchableOpacity
        style={s.card}
        onPress={() => { setSelected(item); setProofPhotoIndex(0); setProofImgErrors({}); }}
        activeOpacity={0.9}
      >
        <View style={[s.cardAccent, { backgroundColor: color }]} />
        <View style={s.cardBody}>
          <View style={s.cardTopRow}>
            <Text style={s.cardName} numberOfLines={1}>{item.lost_item?.name ?? '—'}</Text>
            <View style={[s.statusBadge, { backgroundColor: color + '20' }]}>
              <Text style={[s.statusText, { color }]}>{label}</Text>
            </View>
          </View>
          <Text style={s.cardSub} numberOfLines={1}>Found: {item.found_report?.item_description ?? '—'}</Text>
          <View style={s.cardMeta}>
            <User size={12} color={colors.textMuted} />
            <Text style={s.cardMetaText}>{item.lost_item?.user?.name ?? 'Unknown'}</Text>
            <Clock size={12} color={colors.textMuted} />
            <Text style={s.cardMetaText}>{new Date(item.created_at).toLocaleDateString()}</Text>
          </View>
          {(item.claim?.proof_photos?.length ?? 0) > 0 && (
            <View style={[s.proofBadge, { backgroundColor: '#EFF6FF' }]}>
              <FileCheck size={11} color="#3B82F6" />
              <Text style={s.proofBadgeText}>Proof submitted by student</Text>
            </View>
          )}
          {item.claim?.schedule ? (
            <View style={[s.scheduleBadge, { backgroundColor: colors.primary + '12' }]}>
              <Calendar size={11} color={colors.primary} />
              <Text style={s.scheduleText} numberOfLines={1}>{item.claim.schedule}</Text>
            </View>
          ) : null}
        </View>
      </TouchableOpacity>
    );
  };

  const proofPhotos = selected?.claim?.proof_photos ?? [];
  const hasProofSubmitted = selected?.claim?.status === 'proof_submitted';
  const scheduleFieldsFilled = !!(schedMonth && schedDay && schedYear && schedHour && schedMinute && schedLocation.trim());

  const proofBg = isDark ? '#0B1929' : '#F0F9FF';
  const proofBorder = isDark ? '#1E3A5F' : '#BFDBFE';
  const proofTitle = isDark ? '#93C5FD' : '#1D4ED8';
  const proofGalleryBg = isDark ? '#0A1929' : '#E0F2FE';
  const proofDescText = isDark ? '#BFDBFE' : '#1e3a5f';

  const s = StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.background },
    header: {
      backgroundColor: colors.surface, paddingHorizontal: Spacing.xl,
      paddingVertical: Spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border,
    },
    headerTitle: { fontSize: 20, fontWeight: '800', color: colors.text },
    headerSub: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
    card: {
      backgroundColor: colors.surface, borderRadius: Radius.lg, marginBottom: Spacing.md,
      borderWidth: 1, borderColor: colors.border, flexDirection: 'row', overflow: 'hidden', elevation: 1,
    },
    cardAccent: { width: 4 },
    cardBody: { flex: 1, padding: Spacing.md, gap: 4 },
    cardTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    cardName: { fontSize: 15, fontWeight: '700', color: colors.text, flex: 1, marginRight: Spacing.sm },
    statusBadge: { paddingHorizontal: Spacing.sm, paddingVertical: 3, borderRadius: Radius.full },
    statusText: { fontSize: 10, fontWeight: '700', textTransform: 'capitalize' },
    cardSub: { fontSize: 12, color: colors.textSecondary },
    cardMeta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    cardMetaText: { fontSize: 11, color: colors.textMuted, marginRight: 6 },
    proofBadge: {
      flexDirection: 'row', alignItems: 'center', gap: 4,
      paddingHorizontal: Spacing.sm, paddingVertical: 3, borderRadius: Radius.sm, marginTop: 2,
    },
    proofBadgeText: { fontSize: 11, color: '#3B82F6', fontWeight: '600' },
    scheduleBadge: {
      flexDirection: 'row', alignItems: 'center', gap: 4,
      paddingHorizontal: Spacing.sm, paddingVertical: 4, borderRadius: Radius.sm, marginTop: 2,
    },
    scheduleText: { fontSize: 11, color: colors.primary, fontWeight: '600', flex: 1 },
    empty: { alignItems: 'center', marginTop: 80, gap: Spacing.sm },
    emptyText: { fontSize: 16, fontWeight: '700', color: colors.textSecondary },
    emptySub: { fontSize: 13, color: colors.textMuted },
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
    sheet: {
      backgroundColor: colors.surface, borderTopLeftRadius: Radius.xl,
      borderTopRightRadius: Radius.xl, maxHeight: '92%', flex: 1,
    },
    sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginTop: Spacing.md },
    closeBtn: { position: 'absolute', top: Spacing.lg, right: Spacing.lg, zIndex: 10 },
    sheetBody: { padding: Spacing.xl, gap: Spacing.lg, paddingBottom: Spacing.xxxl },
    sheetTitle: { fontSize: 20, fontWeight: '800', color: colors.text },
    matchCard: {
      flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
      backgroundColor: colors.primaryMuted, borderRadius: Radius.lg, padding: Spacing.md,
    },
    matchSide: { flex: 1, gap: 2 },
    matchSideLabel: { fontSize: 9, fontWeight: '800', color: colors.primary, letterSpacing: 0.5, textTransform: 'uppercase' },
    matchSideName: { fontSize: 13, fontWeight: '700', color: colors.text },
    matchSideSub: { fontSize: 11, color: colors.textSecondary },
    ownerCard: { backgroundColor: colors.gray100, borderRadius: Radius.md, padding: Spacing.md, gap: 2 },
    ownerLabel: { fontSize: 10, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
    ownerName: { fontSize: 15, fontWeight: '700', color: colors.text },
    ownerContact: { fontSize: 13, color: colors.textSecondary },
    proofSection: {
      borderWidth: 1, borderColor: proofBorder, borderRadius: Radius.lg,
      overflow: 'hidden', backgroundColor: proofBg,
    },
    proofSectionHeader: {
      flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
      padding: Spacing.md, borderBottomWidth: 1, borderBottomColor: proofBorder,
    },
    proofSectionTitle: { fontSize: 14, fontWeight: '700', color: proofTitle, flex: 1 },
    proofStatusBadge: { paddingHorizontal: Spacing.sm, paddingVertical: 2, borderRadius: Radius.full },
    proofStatusText: { fontSize: 10, fontWeight: '700', color: '#3B82F6' },
    proofGallery: { height: 200, position: 'relative', backgroundColor: proofGalleryBg },
    proofMainPhoto: { width: '100%', height: 200 },
    proofNavBtn: {
      position: 'absolute', top: '38%',
      backgroundColor: 'rgba(0,0,0,0.35)', borderRadius: 16, padding: 5,
    },
    proofDots: {
      position: 'absolute', bottom: 8, width: '100%',
      flexDirection: 'row', justifyContent: 'center', gap: 5,
    },
    proofDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.5)' },
    proofDotActive: { backgroundColor: '#fff', width: 14 },
    proofThumb: { width: 52, height: 52, borderRadius: Radius.sm, borderWidth: 2, borderColor: 'transparent' },
    proofThumbActive: { borderColor: '#3B82F6' },
    proofDescBox: { padding: Spacing.md, borderTopWidth: 1, borderTopColor: proofBorder },
    proofDescLabel: { fontSize: 10, fontWeight: '700', color: proofTitle, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
    proofDescText: { fontSize: 13, color: proofDescText, lineHeight: 20 },
    noProofBox: {
      flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
      backgroundColor: colors.warning + '12', borderRadius: Radius.md,
      padding: Spacing.md, borderWidth: 1, borderColor: colors.warning + '30',
    },
    noProofText: { fontSize: 13, color: colors.warning, flex: 1 },
    scheduleLabel: { fontSize: 13, fontWeight: '600', color: colors.text },
    schedSublabel: { fontSize: 11, color: colors.textMuted, marginBottom: 4 },
    schedDateRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: Spacing.sm },
    schedSeg: {
      width: 54, borderRadius: Radius.md, borderWidth: 1, borderColor: colors.border,
      paddingHorizontal: 6, paddingVertical: Spacing.md, fontSize: 15,
      textAlign: 'center', fontWeight: '600', color: colors.text, backgroundColor: colors.gray100,
    },
    schedYearSeg: {
      width: 74, borderRadius: Radius.md, borderWidth: 1, borderColor: colors.border,
      paddingHorizontal: 6, paddingVertical: Spacing.md, fontSize: 15,
      textAlign: 'center', fontWeight: '600', color: colors.text, backgroundColor: colors.gray100,
    },
    schedSep: { fontSize: 18, color: colors.textMuted, fontWeight: '300' },
    schedAmPmBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 4,
      borderRadius: Radius.md, borderWidth: 1, borderColor: colors.border,
      paddingHorizontal: Spacing.md, paddingVertical: Spacing.md,
      backgroundColor: colors.gray100, minWidth: 66,
    },
    schedAmPmText: { fontSize: 14, fontWeight: '600', color: colors.text },
    schedLocationInput: {
      backgroundColor: colors.gray100, borderRadius: Radius.md,
      paddingHorizontal: Spacing.md, paddingVertical: Spacing.md,
      fontSize: 14, color: colors.text, borderWidth: 1, borderColor: colors.border,
    },
    approveProofBtn: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
      gap: Spacing.sm, backgroundColor: '#3B82F6', borderRadius: Radius.md, paddingVertical: 14,
    },
    approveProofBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
    resolveBtn: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
      gap: Spacing.sm, backgroundColor: colors.success, borderRadius: Radius.md, paddingVertical: 14,
    },
    resolveBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
    btnDisabled: { opacity: 0.4 },
    resolvedBanner: {
      flexDirection: 'row', alignItems: 'center',
      gap: Spacing.sm, padding: Spacing.md, borderRadius: Radius.md,
    },
    resolvedText: { fontSize: 14, fontWeight: '600' },
    ampmOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.3)' },
    ampmDropdown: { backgroundColor: colors.surface, borderRadius: Radius.md, borderWidth: 1, borderColor: colors.border, overflow: 'hidden', minWidth: 120 },
    ampmOption: { paddingVertical: 14, paddingHorizontal: Spacing.xl, borderBottomWidth: 1, borderBottomColor: colors.border },
  });

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <Text style={s.headerTitle}>Claims</Text>
        <Text style={s.headerSub}>Manage matched items & proof of ownership</Text>
      </View>

      {loading ? <ActivityIndicator style={{ marginTop: 60 }} size="large" color={colors.primary} /> : (
        <FlatList
          data={matches}
          keyExtractor={i => i.id}
          renderItem={renderItem}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
          contentContainerStyle={{ padding: Spacing.xl, paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={s.empty}>
              <Text style={{ fontSize: 40 }}>📦</Text>
              <Text style={s.emptyText}>No matched items yet</Text>
              <Text style={s.emptySub}>Match items first from the Match tab</Text>
            </View>
          }
        />
      )}

      {/* Match detail + proof modal */}
      <Modal visible={!!selected} animationType="slide" transparent onRequestClose={() => { setSelected(null); clearScheduleFields(); }}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <TouchableOpacity style={s.overlay} activeOpacity={1} onPress={() => { setSelected(null); clearScheduleFields(); }}>
            <TouchableOpacity activeOpacity={1} style={s.sheet}>
              <View style={s.sheetHandle} />
              <TouchableOpacity style={s.closeBtn} onPress={() => { setSelected(null); clearScheduleFields(); }}>
                <X size={20} color={colors.textSecondary} />
              </TouchableOpacity>

              {selected && (
                <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                  <View style={s.sheetBody}>
                    <Text style={s.sheetTitle}>Match Details</Text>

                    {/* Item pairing */}
                    <View style={s.matchCard}>
                      <View style={s.matchSide}>
                        <Text style={s.matchSideLabel}>LOST ITEM</Text>
                        <Text style={s.matchSideName}>{selected.lost_item?.name}</Text>
                        <Text style={s.matchSideSub}>{selected.lost_item?.category}</Text>
                      </View>
                      <Package size={20} color={colors.primary} />
                      <View style={s.matchSide}>
                        <Text style={s.matchSideLabel}>FOUND REPORT</Text>
                        <Text style={s.matchSideName} numberOfLines={2}>{selected.found_report?.item_description}</Text>
                      </View>
                    </View>

                    {/* Owner info */}
                    <View style={s.ownerCard}>
                      <Text style={s.ownerLabel}>Item Owner</Text>
                      <Text style={s.ownerName}>{selected.lost_item?.user?.name ?? 'Unknown'}</Text>
                      <Text style={s.ownerContact}>{selected.lost_item?.user?.contact ?? '—'}</Text>
                    </View>

                    {/* Proof of Ownership section */}
                    {proofPhotos.length > 0 ? (
                      <View style={s.proofSection}>
                        <View style={s.proofSectionHeader}>
                          <FileCheck size={16} color="#3B82F6" />
                          <Text style={s.proofSectionTitle}>Proof of Ownership</Text>
                          <View style={[s.proofStatusBadge, { backgroundColor: '#EFF6FF' }]}>
                            <Text style={s.proofStatusText}>Submitted</Text>
                          </View>
                        </View>

                        {/* Proof photo gallery */}
                        <View style={s.proofGallery}>
                          {proofImgErrors[proofPhotoIndex] ? (
                            <View style={[s.proofMainPhoto, { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.gray100 }]}>
                              <Text style={{ fontSize: 48 }}>📷</Text>
                            </View>
                          ) : (
                            <Image
                              source={{ uri: proofPhotos[proofPhotoIndex] }}
                              style={s.proofMainPhoto}
                              resizeMode="cover"
                              onError={() => setProofImgErrors(e => ({ ...e, [proofPhotoIndex]: true }))}
                            />
                          )}
                          {proofPhotos.length > 1 && (
                            <>
                              {proofPhotoIndex > 0 && (
                                <TouchableOpacity
                                  style={[s.proofNavBtn, { left: 6 }]}
                                  onPress={() => setProofPhotoIndex(i => i - 1)}
                                >
                                  <ChevronLeft size={16} color="#fff" />
                                </TouchableOpacity>
                              )}
                              {proofPhotoIndex < proofPhotos.length - 1 && (
                                <TouchableOpacity
                                  style={[s.proofNavBtn, { right: 6 }]}
                                  onPress={() => setProofPhotoIndex(i => i + 1)}
                                >
                                  <ChevronRight size={16} color="#fff" />
                                </TouchableOpacity>
                              )}
                              <View style={s.proofDots}>
                                {proofPhotos.map((_, i) => (
                                  <View key={i} style={[s.proofDot, i === proofPhotoIndex && s.proofDotActive]} />
                                ))}
                              </View>
                            </>
                          )}
                        </View>

                        {/* Proof thumbnails */}
                        {proofPhotos.length > 1 && (
                          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: Spacing.sm }}>
                            <View style={{ flexDirection: 'row', gap: Spacing.sm, paddingVertical: Spacing.xs }}>
                              {proofPhotos.map((uri, i) => (
                                <TouchableOpacity key={i} onPress={() => setProofPhotoIndex(i)}>
                                  <Image
                                    source={{ uri }}
                                    style={[s.proofThumb, i === proofPhotoIndex && s.proofThumbActive]}
                                    resizeMode="cover"
                                  />
                                </TouchableOpacity>
                              ))}
                            </View>
                          </ScrollView>
                        )}

                        {selected.claim?.proof_description ? (
                          <View style={s.proofDescBox}>
                            <Text style={s.proofDescLabel}>Student's Description</Text>
                            <Text style={s.proofDescText}>{selected.claim.proof_description}</Text>
                          </View>
                        ) : null}
                      </View>
                    ) : (
                      selected.status !== 'resolved' && (
                        <View style={s.noProofBox}>
                          <AlertCircle size={16} color={colors.warning} />
                          <Text style={s.noProofText}>Waiting for student to submit proof of ownership.</Text>
                        </View>
                      )
                    )}

                    {/* Actions */}
                    {selected.status !== 'resolved' && (
                      <>
                        {/* Proof submitted and not yet confirmed → show structured schedule picker */}
                        {hasProofSubmitted && selected.status !== 'confirmed' && (
                          <>
                            <Text style={s.scheduleLabel}>
                              Set Claiming Schedule <Text style={{ color: colors.error }}>*</Text>
                            </Text>

                            <Text style={s.schedSublabel}>Date (MM / DD / YYYY)</Text>
                            <View style={s.schedDateRow}>
                              <TextInput
                                style={s.schedSeg}
                                placeholder="MM"
                                placeholderTextColor={colors.textMuted}
                                keyboardType="numeric"
                                maxLength={2}
                                value={schedMonth}
                                onChangeText={v => {
                                  const c = v.replace(/\D/g, '').slice(0, 2);
                                  setSchedMonth(c);
                                  if (c.length === 2) schedDayRef.current?.focus();
                                }}
                              />
                              <Text style={s.schedSep}>/</Text>
                              <TextInput
                                ref={schedDayRef}
                                style={s.schedSeg}
                                placeholder="DD"
                                placeholderTextColor={colors.textMuted}
                                keyboardType="numeric"
                                maxLength={2}
                                value={schedDay}
                                onChangeText={v => {
                                  const c = v.replace(/\D/g, '').slice(0, 2);
                                  setSchedDay(c);
                                  if (c.length === 2) schedYearRef.current?.focus();
                                }}
                              />
                              <Text style={s.schedSep}>/</Text>
                              <TextInput
                                ref={schedYearRef}
                                style={s.schedYearSeg}
                                placeholder="YYYY"
                                placeholderTextColor={colors.textMuted}
                                keyboardType="numeric"
                                maxLength={4}
                                value={schedYear}
                                onChangeText={v => setSchedYear(v.replace(/\D/g, '').slice(0, 4))}
                              />
                            </View>

                            <Text style={[s.schedSublabel, { marginTop: Spacing.sm }]}>Time (HH : MM)</Text>
                            <View style={s.schedDateRow}>
                              <TextInput
                                style={s.schedSeg}
                                placeholder="HH"
                                placeholderTextColor={colors.textMuted}
                                keyboardType="numeric"
                                maxLength={2}
                                value={schedHour}
                                onChangeText={v => {
                                  const c = v.replace(/\D/g, '').slice(0, 2);
                                  setSchedHour(c);
                                  if (c.length === 2) schedMinuteRef.current?.focus();
                                }}
                              />
                              <Text style={s.schedSep}>:</Text>
                              <TextInput
                                ref={schedMinuteRef}
                                style={s.schedSeg}
                                placeholder="MM"
                                placeholderTextColor={colors.textMuted}
                                keyboardType="numeric"
                                maxLength={2}
                                value={schedMinute}
                                onChangeText={v => setSchedMinute(v.replace(/\D/g, '').slice(0, 2))}
                              />
                              <TouchableOpacity style={s.schedAmPmBtn} onPress={() => setShowAmPmModal(true)}>
                                <Text style={s.schedAmPmText}>{schedAmPm}</Text>
                                <ChevronDown size={13} color={colors.textMuted} />
                              </TouchableOpacity>
                            </View>

                            <Text style={[s.schedSublabel, { marginTop: Spacing.sm }]}>Location</Text>
                            <TextInput
                              style={s.schedLocationInput}
                              placeholder="e.g. SDFO Office, Admin Building"
                              placeholderTextColor={colors.textMuted}
                              value={schedLocation}
                              onChangeText={setSchedLocation}
                            />

                            <TouchableOpacity
                              style={[s.approveProofBtn, !scheduleFieldsFilled && s.btnDisabled]}
                              onPress={handleApproveProof}
                              disabled={actionLoading || !scheduleFieldsFilled}
                            >
                              <Check size={16} color="#fff" />
                              <Text style={s.approveProofBtnText}>
                                {actionLoading ? 'Approving...' : 'Approve Proof & Set Schedule'}
                              </Text>
                            </TouchableOpacity>
                          </>
                        )}

                        {/* Mark Resolved — available once confirmed */}
                        {selected.status === 'confirmed' && (
                          <TouchableOpacity
                            style={s.resolveBtn}
                            onPress={handleMarkResolved}
                            disabled={actionLoading}
                          >
                            <Check size={16} color="#fff" />
                            <Text style={s.resolveBtnText}>Mark as Claimed & Resolved</Text>
                          </TouchableOpacity>
                        )}
                      </>
                    )}

                    {selected.status === 'resolved' && (
                      <View style={[s.resolvedBanner, { backgroundColor: colors.success + '15' }]}>
                        <Check size={18} color={colors.success} />
                        <Text style={[s.resolvedText, { color: colors.success }]}>This case has been resolved.</Text>
                      </View>
                    )}
                  </View>
                </ScrollView>
              )}
            </TouchableOpacity>
          </TouchableOpacity>
        </KeyboardAvoidingView>
      </Modal>

      {/* AM/PM picker modal */}
      <Modal visible={showAmPmModal} transparent animationType="fade" onRequestClose={() => setShowAmPmModal(false)}>
        <TouchableOpacity style={s.ampmOverlay} activeOpacity={1} onPress={() => setShowAmPmModal(false)}>
          <View style={s.ampmDropdown}>
            {(['AM', 'PM'] as const).map(opt => (
              <TouchableOpacity
                key={opt}
                style={[s.ampmOption, schedAmPm === opt && { backgroundColor: colors.primary + '20' }]}
                onPress={() => { setSchedAmPm(opt); setShowAmPmModal(false); }}
              >
                <Text style={{ fontSize: 15, color: schedAmPm === opt ? colors.primary : colors.text, fontWeight: schedAmPm === opt ? '700' : '400', textAlign: 'center' }}>
                  {opt}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}
