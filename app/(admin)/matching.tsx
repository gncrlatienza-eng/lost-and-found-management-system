import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  RefreshControl, Modal, ScrollView, Image, Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GitMerge, MapPin, Calendar, X, ChevronLeft, ChevronRight, Check } from 'lucide-react-native';
import { supabase } from '../../lib/supabase';
import { useTheme } from '../../lib/ThemeContext';
import { Spacing, Radius } from '../../constants/theme';
import { attachNotificationTarget } from '../../lib/notificationTargets';
import type { LostItem, FoundReport } from '../../types';

const FOUND_BUCKET = 'found-items';
const resolvePhotoUrl = (uri: string): string => {
  if (!uri || uri.startsWith('http')) return uri;
  return supabase.storage.from(FOUND_BUCKET).getPublicUrl(uri).data.publicUrl;
};

type LostWithUser = LostItem & { user?: { name: string; student_id: string } };
type FoundWithUser = FoundReport & { user?: { name: string; student_id: string } };

export default function MatchingScreen() {
  const { colors } = useTheme();
  const [lostItems, setLostItems] = useState<LostWithUser[]>([]);
  const [foundReports, setFoundReports] = useState<FoundWithUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedLost, setSelectedLost] = useState<LostWithUser | null>(null);
  const [selectedFound, setSelectedFound] = useState<FoundWithUser | null>(null);
  const [previewItem, setPreviewItem] = useState<LostWithUser | FoundWithUser | null>(null);
  const [previewKind, setPreviewKind] = useState<'lost' | 'found'>('lost');
  const [photoIndex, setPhotoIndex] = useState(0);
  const [matching, setMatching] = useState(false);
  const [imgErrors, setImgErrors] = useState<Record<string, boolean>>({});

  const fetchData = async () => {
    const [lostRes, foundRes] = await Promise.all([
      supabase.from('lost_items').select('*, user:users(name, student_id)').eq('status', 'searching').order('created_at', { ascending: false }),
      supabase.from('found_reports').select('*, user:users(name, student_id)').eq('status', 'approved').order('created_at', { ascending: false }),
    ]);
    setLostItems((lostRes.data as LostWithUser[]) || []);
    setFoundReports((foundRes.data as FoundWithUser[]) || []);
  };

  const load = async () => { setLoading(true); await fetchData(); setLoading(false); };
  const onRefresh = useCallback(async () => { setRefreshing(true); await fetchData(); setRefreshing(false); }, []);
  useEffect(() => { load(); }, []);

  const handleMatch = async () => {
    if (!selectedLost || !selectedFound) return Alert.alert('Select Both', 'Please select a lost item and a found report to match.');
    Alert.alert(
      'Confirm Match',
      `Match "${selectedLost.name}" with the found report by ${selectedFound.user?.name ?? 'Unknown'}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Match', onPress: async () => {
            setMatching(true);
            try {
              const { data: { user } } = await supabase.auth.getUser();

              // ✅ ADD THIS — check for existing match first
              const { data: existingMatch } = await supabase
                .from('matches')
                .select('id')
                .eq('lost_item_id', selectedLost.id)
                .maybeSingle();

              if (existingMatch) {
                Alert.alert('Already Matched', 'This lost item already has an existing match. Please resolve or remove it first.');
                setMatching(false);
                return;
              }

              // rest stays exactly the same ↓
              const { error: matchError } = await supabase.from('matches').insert({
                lost_item_id: selectedLost.id,
                found_report_id: selectedFound.id,
                status: 'pending',
                matched_by: user!.id,
              });
              if (matchError) throw matchError;

              await Promise.all([
                supabase.from('lost_items').update({ status: 'possible_match' }).eq('id', selectedLost.id),
                supabase.from('found_reports').update({ status: 'matched_to_owner' }).eq('id', selectedFound.id),
                supabase.from('notifications').insert({
                  user_id: selectedLost.user_id, type: 'match_found',
                  message: attachNotificationTarget(
                    `A possible match has been found for your lost item: ${selectedLost.name}. SDFO will contact you shortly.`,
                    { kind: 'lost', id: selectedLost.id }
                  ),
                }),
                supabase.from('notifications').insert({
                  user_id: selectedFound.user_id, type: 'match_found',
                  message: attachNotificationTarget(
                    `Your found report for "${selectedFound.item_description}" has been matched to a lost item. Thank you for helping!`,
                    { kind: 'found', id: selectedFound.id }
                  ),
                }),
              ]);

              Alert.alert('Matched!', 'Items have been matched and both students notified.');
              setSelectedLost(null); setSelectedFound(null); fetchData();
            } catch (e: any) { Alert.alert('Error', e.message); }
            setMatching(false);
          },
        },
      ]
    );
  };

  const renderLostCard = ({ item }: { item: LostWithUser }) => {
    const isSelected = selectedLost?.id === item.id;
    return (
      <TouchableOpacity
        style={[s.card, isSelected && s.cardSelected]}
        onPress={() => setSelectedLost(prev => prev?.id === item.id ? null : item)}
        activeOpacity={0.85}
      >
        {isSelected && <View style={s.selectedMark}><Check size={12} color="#fff" /></View>}
        {item.photos?.[0] && !imgErrors['l_' + item.id]
          ? <Image source={{ uri: resolvePhotoUrl(item.photos[0]) }} style={s.cardImg} resizeMode="cover" onError={() => setImgErrors(e => ({ ...e, ['l_' + item.id]: true }))} />
          : <View style={[s.cardImg, s.cardImgEmpty]}><Text style={{ fontSize: 24 }}>📦</Text></View>
        }
        <View style={s.cardBody}>
          <Text style={s.cardName} numberOfLines={1}>{item.name}</Text>
          <Text style={s.cardSub} numberOfLines={1}>{item.category} · {item.location}</Text>
          <Text style={s.cardUser}>{item.user?.name ?? 'Unknown'}</Text>
        </View>
        <TouchableOpacity style={s.previewBtn} onPress={() => { setPreviewItem(item); setPreviewKind('lost'); setPhotoIndex(0); }}>
          <Text style={s.previewBtnText}>View</Text>
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  const renderFoundCard = ({ item }: { item: FoundWithUser }) => {
    const isSelected = selectedFound?.id === item.id;
    return (
      <TouchableOpacity
        style={[s.card, isSelected && s.cardSelected]}
        onPress={() => setSelectedFound(prev => prev?.id === item.id ? null : item)}
        activeOpacity={0.85}
      >
        {isSelected && <View style={s.selectedMark}><Check size={12} color="#fff" /></View>}
        {item.photos?.[0] && !imgErrors['f_' + item.id]
          ? <Image source={{ uri: resolvePhotoUrl(item.photos[0]) }} style={s.cardImg} resizeMode="cover" onError={() => setImgErrors(e => ({ ...e, ['f_' + item.id]: true }))} />
          : <View style={[s.cardImg, s.cardImgEmpty]}><Text style={{ fontSize: 24 }}>📦</Text></View>
        }
        <View style={s.cardBody}>
          <Text style={s.cardName} numberOfLines={1}>{item.item_description}</Text>
          <Text style={s.cardSub} numberOfLines={1}>{item.location}</Text>
          <Text style={s.cardUser}>{item.user?.name ?? 'Unknown'}</Text>
        </View>
        <TouchableOpacity style={s.previewBtn} onPress={() => { setPreviewItem(item); setPreviewKind('found'); setPhotoIndex(0); }}>
          <Text style={s.previewBtnText}>View</Text>
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  const photos = previewItem?.photos ?? [];

  const s = StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.background },
    header: { backgroundColor: colors.surface, paddingHorizontal: Spacing.xl, paddingVertical: Spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border },
    headerTitle: { fontSize: 20, fontWeight: '800', color: colors.text },
    headerSub: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
    scroll: { padding: Spacing.xl, paddingBottom: Spacing.lg },
    selectionBar: {
      flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
      backgroundColor: colors.primaryMuted, borderRadius: Radius.lg,
      padding: Spacing.md, marginBottom: Spacing.xl,
      borderWidth: 1, borderColor: colors.primary + '30',
    },
    selectionItem: { flex: 1 },
    selectionLabel: { fontSize: 10, fontWeight: '700', color: colors.primary, textTransform: 'uppercase', letterSpacing: 0.5 },
    selectionValue: { fontSize: 13, fontWeight: '600', color: colors.text, marginTop: 2 },
    sectionLabel: { fontSize: 11, fontWeight: '700', color: colors.textSecondary, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: Spacing.sm },
    countBadge: { fontSize: 11, color: colors.textMuted, fontWeight: '400' },
    card: {
      backgroundColor: colors.surface, borderRadius: Radius.lg, marginBottom: Spacing.sm,
      borderWidth: 1, borderColor: colors.border, overflow: 'hidden',
      flexDirection: 'row', alignItems: 'center', elevation: 1, position: 'relative',
    },
    cardSelected: { borderColor: colors.primary, borderWidth: 2 },
    selectedMark: {
      position: 'absolute', top: 8, left: 8, zIndex: 1,
      width: 20, height: 20, borderRadius: 10, backgroundColor: colors.primary,
      alignItems: 'center', justifyContent: 'center',
    },
    cardImg: { width: 70, height: 70 },
    cardImgEmpty: { backgroundColor: colors.gray100, alignItems: 'center', justifyContent: 'center' },
    cardBody: { flex: 1, paddingHorizontal: Spacing.md, gap: 2 },
    cardName: { fontSize: 14, fontWeight: '700', color: colors.text },
    cardSub: { fontSize: 12, color: colors.textSecondary },
    cardUser: { fontSize: 11, color: colors.textMuted },
    previewBtn: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, marginRight: Spacing.sm, backgroundColor: colors.primaryMuted, borderRadius: Radius.sm },
    previewBtnText: { fontSize: 12, fontWeight: '700', color: colors.primary },
    emptySection: { paddingVertical: Spacing.xl, alignItems: 'center' },
    emptySectionText: { fontSize: 13, color: colors.textMuted },
    matchBtn: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
      gap: Spacing.sm, backgroundColor: colors.primary, borderRadius: Radius.lg,
      paddingVertical: 16, marginTop: Spacing.xl,
    },
    matchBtnDisabled: { opacity: 0.4 },
    matchBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
    sheet: { backgroundColor: colors.surface, borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl, maxHeight: '88%' },
    sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginTop: Spacing.md },
    closeBtn: { position: 'absolute', top: Spacing.lg, right: Spacing.lg, zIndex: 10 },
    gallery: { height: 220, backgroundColor: colors.gray100 },
    galleryImg: { width: '100%', height: 220 },
    galleryEmpty: { alignItems: 'center', justifyContent: 'center' },
    navBtn: { position: 'absolute', top: '40%', backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: 20, padding: 6 },
    dots: { position: 'absolute', bottom: Spacing.sm, width: '100%', flexDirection: 'row', justifyContent: 'center', gap: 6 },
    dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.5)' },
    dotActive: { backgroundColor: '#fff', width: 16 },
    sheetBody: { padding: Spacing.xl, gap: Spacing.md },
    kindTag: { alignSelf: 'flex-start', paddingHorizontal: Spacing.sm, paddingVertical: 4, borderRadius: Radius.sm },
    kindTagText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
    sheetTitle: { fontSize: 18, fontWeight: '800', color: colors.text },
    infoRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
    infoText: { fontSize: 13, color: colors.textSecondary, flex: 1 },
    sheetDesc: { fontSize: 14, color: colors.text, lineHeight: 22 },
  });

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <Text style={s.headerTitle}>Match Items</Text>
        <Text style={s.headerSub}>Select one lost item + one found report</Text>
      </View>

      {loading ? <ActivityIndicator style={{ marginTop: 60 }} size="large" color={colors.primary} /> : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scroll}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}>

          {/* Selection Summary */}
          {(selectedLost || selectedFound) && (
            <View style={s.selectionBar}>
              <View style={s.selectionItem}>
                <Text style={s.selectionLabel}>Lost</Text>
                <Text style={s.selectionValue} numberOfLines={1}>{selectedLost?.name ?? 'Not selected'}</Text>
              </View>
              <GitMerge size={20} color={colors.primary} />
              <View style={s.selectionItem}>
                <Text style={s.selectionLabel}>Found</Text>
                <Text style={s.selectionValue} numberOfLines={1}>{selectedFound?.item_description ?? 'Not selected'}</Text>
              </View>
            </View>
          )}

          {/* Lost Items */}
          <Text style={s.sectionLabel}>Lost Items <Text style={s.countBadge}>({lostItems.length})</Text></Text>
          {lostItems.length === 0
            ? <View style={s.emptySection}><Text style={s.emptySectionText}>No active lost items</Text></View>
            : lostItems.map(item => <View key={item.id}>{renderLostCard({ item })}</View>)
          }

          {/* Found Reports */}
          <Text style={[s.sectionLabel, { marginTop: Spacing.xl }]}>Approved Found Reports <Text style={s.countBadge}>({foundReports.length})</Text></Text>
          {foundReports.length === 0
            ? <View style={s.emptySection}><Text style={s.emptySectionText}>No approved found reports</Text></View>
            : foundReports.map(item => <View key={item.id}>{renderFoundCard({ item })}</View>)
          }

          {/* Match Button */}
          <TouchableOpacity
            style={[s.matchBtn, (!selectedLost || !selectedFound) && s.matchBtnDisabled]}
            onPress={handleMatch}
            disabled={!selectedLost || !selectedFound || matching}
          >
            <GitMerge size={18} color="#fff" />
            <Text style={s.matchBtnText}>{matching ? 'Matching...' : 'Confirm Match'}</Text>
          </TouchableOpacity>
        </ScrollView>
      )}

      {/* Preview Modal */}
      <Modal visible={!!previewItem} animationType="slide" transparent onRequestClose={() => setPreviewItem(null)}>
        <TouchableOpacity style={s.overlay} activeOpacity={1} onPress={() => setPreviewItem(null)}>
          <TouchableOpacity activeOpacity={1} style={s.sheet}>
            <View style={s.sheetHandle} />
            <TouchableOpacity style={s.closeBtn} onPress={() => setPreviewItem(null)}>
              <X size={20} color={colors.textSecondary} />
            </TouchableOpacity>
            {previewItem && (
              <ScrollView showsVerticalScrollIndicator={false}>
                <View style={s.gallery}>
                  {photos.length > 0 ? (
                    <>
                      <Image source={{ uri: resolvePhotoUrl(photos[photoIndex]) }} style={s.galleryImg} resizeMode="cover" onError={() => setImgErrors(e => ({ ...e, ['preview_' + photoIndex]: true }))} />
                      {photos.length > 1 && (
                        <>
                          {photoIndex > 0 && <TouchableOpacity style={[s.navBtn, { left: Spacing.sm }]} onPress={() => setPhotoIndex(p => p - 1)}><ChevronLeft size={18} color="#fff" /></TouchableOpacity>}
                          {photoIndex < photos.length - 1 && <TouchableOpacity style={[s.navBtn, { right: Spacing.sm }]} onPress={() => setPhotoIndex(p => p + 1)}><ChevronRight size={18} color="#fff" /></TouchableOpacity>}
                          <View style={s.dots}>{photos.map((_, i) => <View key={i} style={[s.dot, i === photoIndex && s.dotActive]} />)}</View>
                        </>
                      )}
                    </>
                  ) : <View style={[s.galleryImg, s.galleryEmpty]}><Text style={{ fontSize: 60 }}>📦</Text></View>}
                </View>
                <View style={s.sheetBody}>
                  <View style={[s.kindTag, { backgroundColor: previewKind === 'lost' ? colors.error + '18' : colors.primary + '18' }]}>
                    <Text style={[s.kindTagText, { color: previewKind === 'lost' ? colors.error : colors.primary }]}>{previewKind === 'lost' ? 'LOST ITEM' : 'FOUND REPORT'}</Text>
                  </View>
                  <Text style={s.sheetTitle}>
                    {previewKind === 'lost' ? (previewItem as LostWithUser).name : (previewItem as FoundWithUser).item_description}
                  </Text>
                  <View style={s.infoRow}><MapPin size={14} color={colors.primary} /><Text style={s.infoText}>{previewItem.location}</Text></View>
                  <View style={s.infoRow}>
                    <Calendar size={14} color={colors.primary} />
                    <Text style={s.infoText}>
                      {new Date(previewItem.date_time).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                      {' · '}
                      {new Date(previewItem.date_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
                    </Text>
                  </View>
                  {previewKind === 'lost' && (previewItem as LostWithUser).description && (
                    <Text style={s.sheetDesc}>{(previewItem as LostWithUser).description}</Text>
                  )}
                </View>
              </ScrollView>
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

