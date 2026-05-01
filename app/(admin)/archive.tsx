import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  RefreshControl, Modal, ScrollView, Image, ActivityIndicator, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Archive, MapPin, Calendar, X, ChevronLeft, ChevronRight, Search } from 'lucide-react-native';
import { supabase } from '../../lib/supabase';
import { useTheme } from '../../lib/ThemeContext';
import { Spacing, Radius } from '../../constants/theme';
import type { LostItem } from '../../types';

type ArchivedItem = LostItem & { user?: { name: string; student_id: string } };

export default function ArchiveScreen() {
  const { colors } = useTheme();
  const STATUS_COLOR: Record<string, string> = {
    resolved: colors.success,
    expired: colors.error,
  };
  const [items, setItems] = useState<ArchivedItem[]>([]);
  const [filtered, setFiltered] = useState<ArchivedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'resolved' | 'expired'>('all');
  const [selected, setSelected] = useState<ArchivedItem | null>(null);
  const [photoIndex, setPhotoIndex] = useState(0);

  const fetchItems = async () => {
    const { data } = await supabase
      .from('lost_items')
      .select('*, user:users(name, student_id)')
      .in('status', ['resolved', 'expired'])
      .order('created_at', { ascending: false });
    setItems((data as ArchivedItem[]) || []);
  };

  const load = async () => { setLoading(true); await fetchItems(); setLoading(false); };
  const onRefresh = useCallback(async () => { setRefreshing(true); await fetchItems(); setRefreshing(false); }, []);
  useEffect(() => { load(); }, []);

  useEffect(() => {
    let result = items;
    if (filter !== 'all') result = result.filter(i => i.status === filter);
    if (search) result = result.filter(i =>
      i.name.toLowerCase().includes(search.toLowerCase()) ||
      i.location.toLowerCase().includes(search.toLowerCase())
    );
    setFiltered(result);
  }, [items, filter, search]);

  const s = StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.background },
    header: { backgroundColor: colors.surface, paddingHorizontal: Spacing.xl, paddingVertical: Spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border },
    headerTitle: { fontSize: 20, fontWeight: '800', color: colors.text },
    headerSub: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
    searchBar: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, margin: Spacing.xl, marginBottom: Spacing.sm, backgroundColor: colors.surface, borderRadius: Radius.md, paddingHorizontal: Spacing.md, borderWidth: 1, borderColor: colors.border },
    searchInput: { flex: 1, paddingVertical: 10, fontSize: 14, color: colors.text },
    filterRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingHorizontal: Spacing.xl, marginBottom: Spacing.sm },
    filterPill: { paddingHorizontal: Spacing.md, paddingVertical: 6, borderRadius: Radius.full, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
    filterPillActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    filterText: { fontSize: 12, fontWeight: '600', color: colors.textSecondary },
    filterTextActive: { color: '#fff' },
    countText: { marginLeft: 'auto', fontSize: 12, color: colors.textMuted },
    card: { backgroundColor: colors.surface, borderRadius: Radius.lg, marginBottom: Spacing.md, borderWidth: 1, borderColor: colors.border, overflow: 'hidden', flexDirection: 'row', elevation: 1 },
    cardImg: { width: 80, height: 80 },
    cardImgEmpty: { backgroundColor: colors.gray100, alignItems: 'center', justifyContent: 'center' },
    cardBody: { flex: 1, padding: Spacing.md, gap: 3 },
    cardRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    cardName: { fontSize: 14, fontWeight: '700', color: colors.text, flex: 1, marginRight: 6 },
    statusBadge: { paddingHorizontal: Spacing.sm, paddingVertical: 3, borderRadius: Radius.full },
    statusText: { fontSize: 10, fontWeight: '700', color: '#fff', textTransform: 'capitalize' },
    metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    metaText: { fontSize: 11, color: colors.textSecondary },
    cardUser: { fontSize: 11, color: colors.textMuted },
    empty: { alignItems: 'center', marginTop: 80, gap: Spacing.md },
    emptyText: { fontSize: 16, fontWeight: '700', color: colors.textSecondary },
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
    sheet: { backgroundColor: colors.surface, borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl, maxHeight: '90%' },
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
    statusRow: { alignSelf: 'flex-start', paddingHorizontal: Spacing.md, paddingVertical: 4, borderRadius: Radius.full },
    sheetStatus: { fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
    sheetTitle: { fontSize: 18, fontWeight: '800', color: colors.text },
    infoRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
    infoText: { fontSize: 13, color: colors.textSecondary, flex: 1 },
    sheetDesc: { fontSize: 14, color: colors.text, lineHeight: 22 },
    ownerCard: { backgroundColor: colors.gray100, borderRadius: Radius.md, padding: Spacing.md, gap: 2 },
    ownerLabel: { fontSize: 10, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
    ownerName: { fontSize: 15, fontWeight: '700', color: colors.text },
    ownerSub: { fontSize: 12, color: colors.textSecondary },
  });

  const renderItem = ({ item }: { item: ArchivedItem }) => {
    const color = STATUS_COLOR[item.status] ?? colors.gray400;
    return (
      <TouchableOpacity style={s.card} onPress={() => { setSelected(item); setPhotoIndex(0); }} activeOpacity={0.9}>
        {item.photos?.[0]
          ? <Image source={{ uri: item.photos[0] }} style={s.cardImg} resizeMode="cover" />
          : <View style={[s.cardImg, s.cardImgEmpty]}><Text style={{ fontSize: 28 }}>📦</Text></View>
        }
        <View style={s.cardBody}>
          <View style={s.cardRow}>
            <Text style={s.cardName} numberOfLines={1}>{item.name}</Text>
            <View style={[s.statusBadge, { backgroundColor: color }]}>
              <Text style={s.statusText}>{item.status}</Text>
            </View>
          </View>
          <View style={s.metaRow}><MapPin size={11} color={colors.textMuted} /><Text style={s.metaText}>{item.location}</Text></View>
          <View style={s.metaRow}><Calendar size={11} color={colors.textMuted} /><Text style={s.metaText}>{new Date(item.created_at).toLocaleDateString()}</Text></View>
          <Text style={s.cardUser}>{item.user?.name ?? 'Unknown'} · {item.category}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <Text style={s.headerTitle}>Archive</Text>
        <Text style={s.headerSub}>Resolved & expired cases</Text>
      </View>

      {/* Search */}
      <View style={s.searchBar}>
        <Search size={16} color={colors.textMuted} />
        <TextInput
          style={s.searchInput}
          placeholder="Search archived items..."
          placeholderTextColor={colors.textMuted}
          value={search}
          onChangeText={setSearch}
        />
        {search.length > 0 && <TouchableOpacity onPress={() => setSearch('')}><X size={14} color={colors.textMuted} /></TouchableOpacity>}
      </View>

      {/* Filter */}
      <View style={s.filterRow}>
        {(['all', 'resolved', 'expired'] as const).map(f => (
          <TouchableOpacity key={f} style={[s.filterPill, filter === f && s.filterPillActive]} onPress={() => setFilter(f)}>
            <Text style={[s.filterText, filter === f && s.filterTextActive]}>{f.charAt(0).toUpperCase() + f.slice(1)}</Text>
          </TouchableOpacity>
        ))}
        <Text style={s.countText}>{filtered.length >= 100 ? '99+' : filtered.length} items</Text>
      </View>

      {loading ? <ActivityIndicator style={{ marginTop: 60 }} size="large" color={colors.primary} /> : (
        <FlatList
          data={filtered}
          keyExtractor={i => i.id}
          renderItem={renderItem}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
          contentContainerStyle={{ padding: Spacing.xl, paddingBottom: Spacing.lg }}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={s.empty}>
              <Archive size={40} color={colors.gray300} />
              <Text style={s.emptyText}>No archived items</Text>
            </View>
          }
        />
      )}

      <Modal visible={!!selected} animationType="slide" transparent onRequestClose={() => setSelected(null)}>
        <TouchableOpacity style={s.overlay} activeOpacity={1} onPress={() => setSelected(null)}>
          <TouchableOpacity activeOpacity={1} style={s.sheet}>
            <View style={s.sheetHandle} />
            <TouchableOpacity style={s.closeBtn} onPress={() => setSelected(null)}>
              <X size={20} color={colors.textSecondary} />
            </TouchableOpacity>
            {selected && (
              <ScrollView showsVerticalScrollIndicator={false}>
                <View style={s.gallery}>
                  {(selected.photos?.length ?? 0) > 0 ? (
                    <>
                      <Image source={{ uri: selected.photos[photoIndex] }} style={s.galleryImg} resizeMode="cover" />
                      {selected.photos.length > 1 && (
                        <>
                          {photoIndex > 0 && <TouchableOpacity style={[s.navBtn, { left: Spacing.sm }]} onPress={() => setPhotoIndex(p => p - 1)}><ChevronLeft size={18} color="#fff" /></TouchableOpacity>}
                          {photoIndex < selected.photos.length - 1 && <TouchableOpacity style={[s.navBtn, { right: Spacing.sm }]} onPress={() => setPhotoIndex(p => p + 1)}><ChevronRight size={18} color="#fff" /></TouchableOpacity>}
                          <View style={s.dots}>{selected.photos.map((_, i) => <View key={i} style={[s.dot, i === photoIndex && s.dotActive]} />)}</View>
                        </>
                      )}
                    </>
                  ) : <View style={[s.galleryImg, s.galleryEmpty]}><Text style={{ fontSize: 60 }}>📦</Text></View>}
                </View>
                <View style={s.sheetBody}>
                  <View style={[s.statusRow, { backgroundColor: (STATUS_COLOR[selected.status] ?? colors.gray400) + '18' }]}>
                    <Text style={[s.sheetStatus, { color: STATUS_COLOR[selected.status] ?? colors.gray400 }]}>{selected.status.toUpperCase()}</Text>
                  </View>
                  <Text style={s.sheetTitle}>{selected.name}</Text>
                  <View style={s.infoRow}><MapPin size={14} color={colors.primary} /><Text style={s.infoText}>{selected.location}</Text></View>
                  <View style={s.infoRow}>
                    <Calendar size={14} color={colors.primary} />
                    <Text style={s.infoText}>
                      {new Date(selected.date_time).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                      {' · '}
                      {new Date(selected.date_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
                    </Text>
                  </View>
                  <Text style={s.sheetDesc}>{selected.description}</Text>
                  <View style={s.ownerCard}>
                    <Text style={s.ownerLabel}>Posted By</Text>
                    <Text style={s.ownerName}>{selected.user?.name ?? 'Unknown'}</Text>
                    <Text style={s.ownerSub}>ID: {selected.user?.student_id ?? '—'} · {selected.category}</Text>
                  </View>
                </View>
              </ScrollView>
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

