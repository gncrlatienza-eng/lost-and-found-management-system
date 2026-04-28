import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, TextInput, TouchableOpacity,
  StyleSheet, RefreshControl, Modal, ScrollView, Image,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { Bell, Search, X, MapPin, Calendar, ChevronLeft, ChevronRight } from 'lucide-react-native';
import { useTheme } from '../../lib/ThemeContext';
import { supabase } from '../../lib/supabase';
import { Spacing, Radius } from '../../constants/theme';
import type { LostItem, User } from '../../types';

const CATEGORIES = ['All', 'Bag', 'Wallet', 'Keys', 'Phone', 'ID', 'Clothing', 'Other'];

const STATUS_COLOR: Record<string, string> = {
  searching: '#F59E0B',
  possible_match: '#3B82F6',
  ready_for_claiming: '#10B981',
  resolved: '#6B7280',
  expired: '#EF4444',
};

const STATUS_LABEL: Record<string, string> = {
  searching: 'Searching',
  possible_match: 'Match Found',
  ready_for_claiming: 'Ready to Claim',
  resolved: 'Resolved',
  expired: 'Expired',
};

type LostItemWithUser = LostItem & { user?: User };

export default function HomeScreen() {
  const { colors } = useTheme();
  const [items, setItems] = useState<LostItemWithUser[]>([]);
  const [filtered, setFiltered] = useState<LostItemWithUser[]>([]);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState<LostItemWithUser | null>(null);
  const [photoIndex, setPhotoIndex] = useState(0);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setCurrentUserId(data.user?.id ?? null));
    fetchItems();
    fetchUnread();
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchItems();
      fetchUnread();
    }, [])
  );

  useEffect(() => {
    let result = items;
    if (category !== 'All') result = result.filter(i => i.category === category);
    if (search) result = result.filter(i =>
      i.name.toLowerCase().includes(search.toLowerCase()) ||
      i.description.toLowerCase().includes(search.toLowerCase()) ||
      i.location.toLowerCase().includes(search.toLowerCase())
    );
    setFiltered(result);
  }, [search, category, items]);

  const fetchItems = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('lost_items')
      .select('*, user:users(id,name,student_id)')
      .in('status', ['searching', 'possible_match'])
      .order('created_at', { ascending: false });
    setItems((data as LostItemWithUser[]) || []);
    setLoading(false);
  };

  const fetchUnread = async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) return;
    const { count } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', data.user.id)
      .eq('read', false);
    setUnread(count || 0);
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([fetchItems(), fetchUnread()]);
    setRefreshing(false);
  }, []);

  const renderItem = ({ item }: { item: LostItemWithUser }) => {
    const isOwn = item.user_id === currentUserId;
    const color = STATUS_COLOR[item.status] || '#6B7280';
    return (
      <TouchableOpacity
        style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
        onPress={() => { setSelected(item); setPhotoIndex(0); }}
        activeOpacity={0.9}
      >
        {item.photos?.[0] ? (
          <Image source={{ uri: item.photos[0] }} style={s.cardImg} resizeMode="cover" />
        ) : (
          <View style={[s.cardImg, { backgroundColor: colors.gray100, alignItems: 'center', justifyContent: 'center' }]}>
            <Text style={{ fontSize: 40 }}>📦</Text>
          </View>
        )}
        <View style={s.cardBody}>
          <View style={s.cardRow}>
            <Text style={[s.cardName, { color: colors.text }]} numberOfLines={1}>{item.name}</Text>
            <View style={[s.statusBadge, { backgroundColor: color }]}>
              <Text style={s.statusText}>{STATUS_LABEL[item.status]}</Text>
            </View>
          </View>
          <View style={s.metaRow}>
            <View style={s.metaItem}>
              <MapPin size={12} color={colors.textMuted} />
              <Text style={[s.metaText, { color: colors.textSecondary }]} numberOfLines={1}>{item.location}</Text>
            </View>
            <View style={s.metaItem}>
              <Calendar size={12} color={colors.textMuted} />
              <Text style={[s.metaText, { color: colors.textSecondary }]}>{new Date(item.date_time).toLocaleDateString()}</Text>
            </View>
          </View>
          {isOwn && (
            <View style={[s.yourPost, { backgroundColor: colors.primaryMuted }]}>
              <Text style={[s.yourPostText, { color: colors.primary }]}>Your Post</Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  const isOwn = selected?.user_id === currentUserId;

  return (
    <SafeAreaView style={[s.safe, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[s.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <View>
          <Text style={[s.headerTitle, { color: colors.primary }]}>LAFMS</Text>
          <Text style={[s.headerSub, { color: colors.textSecondary }]}>Lost & Found · DLSL</Text>
        </View>
        <TouchableOpacity onPress={() => router.push('/(student)/notifications')} style={s.bellWrap}>
          <Bell size={24} color={colors.text} />
          {unread > 0 && (
            <View style={[s.badge, { backgroundColor: colors.error }]}>
              <Text style={s.badgeText}>{unread > 9 ? '9+' : unread}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* Search */}
      <View style={[s.searchBar, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Search size={18} color={colors.textMuted} />
        <TextInput
          style={[s.searchInput, { color: colors.text }]}
          placeholder="Search lost items..."
          placeholderTextColor={colors.textMuted}
          value={search}
          onChangeText={setSearch}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')}>
            <X size={16} color={colors.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      {/* Category Pills */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={s.catsScroll}
        contentContainerStyle={s.catsContent}
      >
        {CATEGORIES.map(c => {
          const active = c === category;
          return (
            <TouchableOpacity
              key={c}
              style={[s.cat, {
                backgroundColor: active ? colors.primary : colors.surface,
                borderColor: active ? colors.primary : colors.border,
              }]}
              onPress={() => setCategory(c)}
              activeOpacity={0.8}
            >
              <Text style={[s.catText, { color: active ? '#fff' : colors.textSecondary }]}>{c}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* List */}
      {loading ? (
        <ActivityIndicator style={{ marginTop: 60 }} color={colors.primary} size="large" />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={i => i.id}
          renderItem={renderItem}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 100, paddingTop: Spacing.sm }}
          ListEmptyComponent={
            <View style={s.empty}>
              <Text style={{ fontSize: 48 }}>🔍</Text>
              <Text style={[s.emptyText, { color: colors.text }]}>No lost items found</Text>
              <Text style={[s.emptySub, { color: colors.textSecondary }]}>Try adjusting your search or filters</Text>
            </View>
          }
        />
      )}

      {/* Detail Modal */}
      <Modal visible={!!selected} animationType="slide" transparent onRequestClose={() => setSelected(null)}>
        <TouchableOpacity style={s.overlay} activeOpacity={1} onPress={() => setSelected(null)}>
          <TouchableOpacity activeOpacity={1} style={[s.sheet, { backgroundColor: colors.surface }]}>
            <View style={[s.sheetHandle, { backgroundColor: colors.border }]} />
            <TouchableOpacity style={s.closeBtn} onPress={() => setSelected(null)}>
              <X size={22} color={colors.textSecondary} />
            </TouchableOpacity>
            {selected && (
              <ScrollView showsVerticalScrollIndicator={false}>
                {/* Gallery */}
                <View style={[s.gallery, { backgroundColor: colors.gray100 }]}>
                  {selected.photos?.length > 0 ? (
                    <>
                      <Image source={{ uri: selected.photos[photoIndex] }} style={s.galleryImg} resizeMode="cover" />
                      {selected.photos.length > 1 && (
                        <>
                          {photoIndex > 0 && (
                            <TouchableOpacity style={[s.navBtn, { left: Spacing.sm }]} onPress={() => setPhotoIndex(p => p - 1)}>
                              <ChevronLeft size={20} color="#fff" />
                            </TouchableOpacity>
                          )}
                          {photoIndex < selected.photos.length - 1 && (
                            <TouchableOpacity style={[s.navBtn, { right: Spacing.sm }]} onPress={() => setPhotoIndex(p => p + 1)}>
                              <ChevronRight size={20} color="#fff" />
                            </TouchableOpacity>
                          )}
                          <View style={s.galleryNav}>
                            {selected.photos.map((_, i) => (
                              <View key={i} style={[s.dot, i === photoIndex && s.dotActive]} />
                            ))}
                          </View>
                        </>
                      )}
                    </>
                  ) : (
                    <View style={[s.galleryImg, { alignItems: 'center', justifyContent: 'center' }]}>
                      <Text style={{ fontSize: 60 }}>📦</Text>
                    </View>
                  )}
                </View>

                {/* Content */}
                <View style={s.sheetContent}>
                  <Text style={[s.sheetName, { color: colors.text }]}>{selected.name}</Text>
                  <View style={s.sheetMeta}>
                    <View style={s.sheetMetaItem}>
                      <MapPin size={14} color={colors.primary} />
                      <Text style={[s.sheetMetaText, { color: colors.textSecondary }]}>{selected.location}</Text>
                    </View>
                    <View style={s.sheetMetaItem}>
                      <Calendar size={14} color={colors.primary} />
                      <Text style={[s.sheetMetaText, { color: colors.textSecondary }]}>
                      {new Date(selected.date_time).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                      {' · '}
                      {new Date(selected.date_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
                    </Text>
                    </View>
                  </View>
                  <Text style={[s.sheetDesc, { color: colors.text }]}>{selected.description}</Text>

                  {isOwn && selected.status === 'searching' ? (
                    <View style={s.editRow}>
                      <TouchableOpacity
                        style={[s.editBtn, { borderColor: colors.border }]}
                        onPress={() => { setSelected(null); router.push({ pathname: '/(student)/post', params: { id: selected.id } }); }}
                      >
                        <Text style={[s.editBtnText, { color: colors.text }]}>Edit</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[s.editBtn, s.deleteBtn]}
                        onPress={async () => {
                          await supabase.from('lost_items').delete().eq('id', selected.id);
                          setSelected(null);
                          fetchItems();
                        }}
                      >
                        <Text style={[s.editBtnText, { color: colors.error }]}>Delete</Text>
                      </TouchableOpacity>
                    </View>
                  // ✅ AFTER
) : !isOwn && selected.status === 'searching' ? (
  <TouchableOpacity
    style={[s.foundBtn, { backgroundColor: colors.primary }]}
    onPress={() => { setSelected(null); router.push({ pathname: '/(student)/found', params: { lost_item_id: selected.id } }); }}
  >
    <Text style={s.foundBtnText}>I Found This</Text>
  </TouchableOpacity>
) : !isOwn && selected.status === 'possible_match' ? (
  <View style={[s.foundBtn, { backgroundColor: '#EFF6FF', borderWidth: 1, borderColor: '#BFDBFE' }]}>
    <Text style={{ color: '#1D4ED8', fontSize: 14, fontWeight: '600', textAlign: 'center' }}>
      A match is already being reviewed for this item
    </Text>
  </View>
) : null}
                </View>
              </ScrollView>
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1 },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md,
    borderBottomWidth: 1,
  },
  headerTitle: { fontSize: 22, fontWeight: '800' },
  headerSub: { fontSize: 12 },
  bellWrap: { position: 'relative', padding: 4 },
  badge: {
    position: 'absolute', top: 0, right: 0,
    width: 16, height: 16, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center',
  },
  badgeText: { color: '#fff', fontSize: 9, fontWeight: '700' },

  // Search
  searchBar: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: Spacing.xl, marginTop: Spacing.md, marginBottom: Spacing.sm,
    borderRadius: Radius.md, paddingHorizontal: Spacing.md,
    borderWidth: 1, gap: Spacing.sm,
  },
  searchInput: { flex: 1, paddingVertical: 10, fontSize: 14 },

  // Categories
  catsScroll: { flexGrow: 0, flexShrink: 0, marginBottom: Spacing.sm },
  catsContent: { paddingHorizontal: Spacing.xl, alignItems: 'center', gap: Spacing.sm },
  cat: {
    paddingHorizontal: Spacing.md, paddingVertical: 6,
    borderRadius: Radius.full, borderWidth: 1,
  },
  catText: { fontSize: 13, fontWeight: '600' },

  // Cards
  card: {
    marginHorizontal: Spacing.xl, marginBottom: Spacing.md,
    borderRadius: Radius.lg, overflow: 'hidden', borderWidth: 1,
    elevation: 2,
  },
  cardImg: { width: '100%', height: 160 },
  cardBody: { padding: Spacing.md },
  cardRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  cardName: { fontSize: 16, fontWeight: '700', flex: 1, marginRight: 8 },
  statusBadge: { paddingHorizontal: Spacing.sm, paddingVertical: 3, borderRadius: Radius.full },
  statusText: { fontSize: 11, fontWeight: '700', color: '#fff' },
  metaRow: { flexDirection: 'row', gap: Spacing.md },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: 12 },
  yourPost: {
    alignSelf: 'flex-start', marginTop: 6,
    paddingHorizontal: Spacing.sm, paddingVertical: 2, borderRadius: Radius.sm,
  },
  yourPostText: { fontSize: 11, fontWeight: '600' },

  // Empty
  empty: { alignItems: 'center', marginTop: 80, gap: Spacing.md },
  emptyText: { fontSize: 18, fontWeight: '700' },
  emptySub: { fontSize: 14 },

  // Modal
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl, maxHeight: '90%' },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginTop: Spacing.md },
  closeBtn: { position: 'absolute', top: Spacing.lg, right: Spacing.lg, zIndex: 10 },
  gallery: { height: 240 },
  galleryImg: { width: '100%', height: 240 },
  galleryNav: {
    position: 'absolute', bottom: Spacing.sm, width: '100%',
    flexDirection: 'row', justifyContent: 'center', gap: 6,
  },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.5)' },
  dotActive: { backgroundColor: '#fff', width: 16 },
  navBtn: {
    position: 'absolute', top: '40%',
    backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: 20, padding: 6,
  },
  sheetContent: { padding: Spacing.xl },
  sheetName: { fontSize: 22, fontWeight: '800', marginBottom: Spacing.sm },
  sheetMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md, marginBottom: Spacing.lg },
  sheetMetaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  sheetMetaText: { fontSize: 13 },
  sheetDesc: { fontSize: 14, lineHeight: 22, marginBottom: Spacing.xl },
  foundBtn: { borderRadius: Radius.md, paddingVertical: 16, alignItems: 'center' },
  foundBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  editRow: { flexDirection: 'row', gap: Spacing.md, marginBottom: Spacing.md },
  editBtn: {
    flex: 1, borderRadius: Radius.md, paddingVertical: 14,
    alignItems: 'center', borderWidth: 1,
  },
  editBtnText: { fontSize: 14, fontWeight: '600' },
  deleteBtn: { backgroundColor: '#FEE2E2', borderColor: '#FECACA' },
});