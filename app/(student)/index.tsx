import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, TextInput, TouchableOpacity,
  StyleSheet, RefreshControl, Modal, ScrollView, Image,
  ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { Bell, Search, X, MapPin, Calendar, ChevronLeft, ChevronRight } from 'lucide-react-native';
import { useTheme } from '../../lib/ThemeContext';
import { supabase } from '../../lib/supabase';
import { Spacing, Radius } from '../../constants/theme';
import PhotoViewerModal from '../../components/PhotoViewerModal';
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
  const [isPhotoViewerOpen, setIsPhotoViewerOpen] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [unread, setUnread] = useState(0);

  const cardMediaHeight = 150;

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
    if (category !== 'All') result = result.filter((item) => item.category === category);
    if (search) {
      const keyword = search.toLowerCase();
      result = result.filter((item) =>
        item.name.toLowerCase().includes(keyword) ||
        item.description.toLowerCase().includes(keyword) ||
        item.location.toLowerCase().includes(keyword)
      );
    }
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

  const confirmDelete = (item: LostItemWithUser) => {
    Alert.alert('Delete Post?', `Delete "${item.name}" from your lost posts?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await supabase.from('lost_items').delete().eq('id', item.id);
          if (selected?.id === item.id) {
            setSelected(null);
            setIsPhotoViewerOpen(false);
          }
          fetchItems();
        },
      },
    ]);
  };

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
          <View style={[s.cardImgWrap, { backgroundColor: colors.gray100, height: cardMediaHeight }]}>
            <Image source={{ uri: item.photos[0] }} style={s.cardImg} resizeMode="cover" />
          </View>
        ) : (
          <View style={[s.cardImgWrap, { backgroundColor: colors.gray100, height: cardMediaHeight, alignItems: 'center', justifyContent: 'center' }]}>
            <Text style={[s.emptyMediaText, { color: colors.textMuted }]}>No image</Text>
          </View>
        )}
        <View style={s.cardBody}>
          <View style={s.cardRow}>
            <Text style={[s.cardName, { color: colors.text }]} numberOfLines={2}>{item.name}</Text>
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
        </View>
      </TouchableOpacity>
    );
  };

  const isOwn = selected?.user_id === currentUserId;

  return (
    <SafeAreaView style={[s.safe, { backgroundColor: colors.background }]}>
      <View style={[s.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <View>
          <Text style={[s.headerTitle, { color: colors.primary }]}>LAFMS</Text>
          <Text style={[s.headerSub, { color: colors.textSecondary }]}>Lost & Found · DLSL</Text>
        </View>
        <TouchableOpacity onPress={() => router.push('/(student)/notifications')} style={s.bellWrap}>
          <Bell size={24} color={colors.text} />
          {unread > 0 ? (
            <View style={[s.badge, { backgroundColor: colors.error }]}>
              <Text style={s.badgeText}>{unread > 9 ? '9+' : unread}</Text>
            </View>
          ) : null}
        </TouchableOpacity>
      </View>

      <View style={[s.searchBar, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Search size={18} color={colors.textMuted} />
        <TextInput
          style={[s.searchInput, { color: colors.text }]}
          placeholder="Search lost items..."
          placeholderTextColor={colors.textMuted}
          value={search}
          onChangeText={setSearch}
        />
        {search.length > 0 ? (
          <TouchableOpacity onPress={() => setSearch('')}>
            <X size={16} color={colors.textMuted} />
          </TouchableOpacity>
        ) : null}
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={s.catsScroll}
        contentContainerStyle={s.catsContent}
      >
        {CATEGORIES.map((itemCategory) => {
          const active = itemCategory === category;
          return (
            <TouchableOpacity
              key={itemCategory}
              style={[s.cat, {
                backgroundColor: active ? colors.primary : colors.surface,
                borderColor: active ? colors.primary : colors.border,
              }]}
              onPress={() => setCategory(itemCategory)}
              activeOpacity={0.8}
            >
              <Text style={[s.catText, { color: active ? '#fff' : colors.textSecondary }]}>{itemCategory}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 60 }} color={colors.primary} size="large" />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={filtered.length === 0 ? s.listEmptyContent : s.listContent}
          ListEmptyComponent={(
            <View style={s.empty}>
              <Text style={[s.emptyText, { color: colors.text }]}>No lost items found</Text>
              <Text style={[s.emptySub, { color: colors.textSecondary }]}>Try adjusting your search or filters</Text>
            </View>
          )}
        />
      )}

      <Modal
        visible={!!selected}
        transparent
        animationType="slide"
        statusBarTranslucent
        presentationStyle="overFullScreen"
        onRequestClose={() => setSelected(null)}
      >
        <TouchableOpacity style={s.overlay} activeOpacity={1} onPress={() => setSelected(null)}>
          <TouchableOpacity activeOpacity={1} style={[s.sheet, { backgroundColor: colors.surface }]}>
            <View style={[s.sheetHandle, { backgroundColor: colors.border }]} />
            <TouchableOpacity style={s.closeBtn} onPress={() => setSelected(null)}>
              <X size={22} color={colors.textSecondary} />
            </TouchableOpacity>
            {selected ? (
              <ScrollView showsVerticalScrollIndicator={false}>
                <TouchableOpacity
                  style={[s.gallery, { backgroundColor: colors.gray100 }]}
                  onPress={() => setIsPhotoViewerOpen(true)}
                  activeOpacity={0.92}
                >
                  {selected.photos?.length > 0 ? (
                    <>
                      <Image source={{ uri: selected.photos[photoIndex] }} style={s.galleryImg} resizeMode="cover" />
                      {selected.photos.length > 1 ? (
                        <>
                          {photoIndex > 0 ? (
                            <TouchableOpacity style={[s.navBtn, { left: Spacing.sm }]} onPress={() => setPhotoIndex((current) => current - 1)}>
                              <ChevronLeft size={20} color="#fff" />
                            </TouchableOpacity>
                          ) : null}
                          {photoIndex < selected.photos.length - 1 ? (
                            <TouchableOpacity style={[s.navBtn, { right: Spacing.sm }]} onPress={() => setPhotoIndex((current) => current + 1)}>
                              <ChevronRight size={20} color="#fff" />
                            </TouchableOpacity>
                          ) : null}
                        </>
                      ) : null}
                      <View style={s.galleryNav}>
                        {selected.photos.map((_, index) => (
                          <View key={index} style={[s.dot, index === photoIndex && s.dotActive]} />
                        ))}
                      </View>
                      <View style={s.tapHintWrap}>
                        <Text style={s.tapHintText}>Tap image to view full photo</Text>
                      </View>
                    </>
                  ) : (
                    <View style={[s.galleryImg, { alignItems: 'center', justifyContent: 'center' }]}>
                      <Text style={[s.emptyMediaText, { color: colors.textMuted }]}>No image uploaded</Text>
                    </View>
                  )}
                </TouchableOpacity>

                <View style={s.sheetContent}>
                  <View style={s.detailTitleRow}>
                    <Text style={[s.sheetName, { color: colors.text }]}>{selected.name}</Text>
                    <View style={[s.statusBadge, { backgroundColor: STATUS_COLOR[selected.status] || '#6B7280' }]}>
                      <Text style={s.statusText}>{STATUS_LABEL[selected.status]}</Text>
                    </View>
                  </View>

                  <View style={s.sheetMeta}>
                    <View style={s.sheetMetaItem}>
                      <MapPin size={14} color={colors.primary} />
                      <Text style={[s.sheetMetaText, { color: colors.textSecondary }]}>{selected.location}</Text>
                    </View>
                    <View style={s.sheetMetaItem}>
                      <Calendar size={14} color={colors.primary} />
                      <Text style={[s.sheetMetaText, { color: colors.textSecondary }]}>{new Date(selected.date_time).toLocaleString()}</Text>
                    </View>
                  </View>

                  <Text style={[s.sectionLabel, { color: colors.textMuted }]}>Description</Text>
                  <Text style={[s.sheetDesc, { color: colors.text }]}>{selected.description}</Text>

                  {isOwn && selected.status === 'searching' ? (
                    <View style={s.actionRow}>
                      <TouchableOpacity
                        style={[s.secondaryButton, { borderColor: colors.border }]}
                        onPress={() => {
                          setSelected(null);
                          router.push({ pathname: '/(student)/post', params: { id: selected.id } });
                        }}
                      >
                        <Text style={[s.secondaryButtonText, { color: colors.text }]}>Edit Post</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[s.secondaryButton, s.dangerButton]}
                        onPress={() => confirmDelete(selected)}
                      >
                        <Text style={[s.secondaryButtonText, { color: colors.error }]}>Delete</Text>
                      </TouchableOpacity>
                    </View>
                  ) : null}

                  {!isOwn && selected.status === 'searching' ? (
                    <TouchableOpacity
                      style={[s.primaryButton, { backgroundColor: colors.primary }]}
                      onPress={() => {
                        setSelected(null);
                        router.push({
                          pathname: '/(student)/found',
                          params: { lost_item_id: selected.id, lost_item_name: selected.name },
                        });
                      }}
                    >
                      <Text style={s.primaryButtonText}>I Found This</Text>
                    </TouchableOpacity>
                  ) : null}

                  {!isOwn && selected.status === 'possible_match' ? (
                    <View style={s.infoBanner}>
                      <Text style={s.infoBannerText}>A match is already being reviewed for this item.</Text>
                    </View>
                  ) : null}
                </View>
              </ScrollView>
            ) : null}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      <PhotoViewerModal
        visible={isPhotoViewerOpen}
        photos={selected?.photos ?? []}
        index={photoIndex}
        onClose={() => setIsPhotoViewerOpen(false)}
        onIndexChange={setPhotoIndex}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1 },
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
  searchBar: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: Spacing.xl, marginTop: Spacing.md, marginBottom: Spacing.sm,
    borderRadius: Radius.md, paddingHorizontal: Spacing.md,
    borderWidth: 1, gap: Spacing.sm,
  },
  searchInput: { flex: 1, paddingVertical: 10, fontSize: 14 },
  catsScroll: { flexGrow: 0, flexShrink: 0, marginBottom: Spacing.sm },
  catsContent: { paddingHorizontal: Spacing.xl, alignItems: 'center', gap: Spacing.sm },
  cat: {
    paddingHorizontal: Spacing.md, paddingVertical: 6,
    borderRadius: Radius.full, borderWidth: 1,
  },
  catText: { fontSize: 13, fontWeight: '600' },
  card: {
    marginHorizontal: Spacing.xl, marginBottom: Spacing.md,
    borderRadius: Radius.lg, overflow: 'hidden', borderWidth: 1,
    elevation: 2,
  },
  cardImgWrap: { width: '100%' },
  cardImg: { width: '100%', height: '100%' },
  cardBody: { padding: Spacing.md },
  cardRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 6, gap: Spacing.sm },
  cardName: { fontSize: 16, fontWeight: '700', flex: 1 },
  statusBadge: { paddingHorizontal: Spacing.sm, paddingVertical: 4, borderRadius: Radius.full },
  statusText: { fontSize: 11, fontWeight: '700', color: '#fff' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, flexWrap: 'wrap' },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: 12, flexShrink: 1 },
  listContent: { paddingTop: Spacing.sm, paddingBottom: Spacing.lg },
  listEmptyContent: { flexGrow: 1, paddingTop: Spacing.sm, paddingBottom: Spacing.lg },
  empty: { alignItems: 'center', justifyContent: 'center', flex: 1, gap: Spacing.md, paddingHorizontal: Spacing.xl },
  emptyText: { fontSize: 18, fontWeight: '700', textAlign: 'center' },
  emptySub: { fontSize: 14, textAlign: 'center' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl, maxHeight: '90%' },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginTop: Spacing.md },
  closeBtn: { position: 'absolute', top: Spacing.lg, right: Spacing.lg, zIndex: 10 },
  gallery: { height: 240 },
  galleryImg: { width: '100%', height: 240 },
  sheetContent: { padding: Spacing.xl },
  sheetName: { flex: 1, fontSize: 22, fontWeight: '800' },
  sheetMeta: { gap: Spacing.sm, marginBottom: Spacing.lg },
  sheetMetaItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sheetMetaText: { fontSize: 13, flexShrink: 1 },
  sheetDesc: { fontSize: 14, lineHeight: 22, marginBottom: Spacing.xl },
  emptyMediaText: {
    fontSize: 14,
    fontWeight: '600',
  },
  tapHintWrap: {
    position: 'absolute',
    bottom: Spacing.sm,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
  },
  tapHintText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  galleryNav: {
    position: 'absolute',
    bottom: Spacing.sm,
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.5)' },
  dotActive: { backgroundColor: '#fff', width: 16 },
  navBtn: {
    position: 'absolute', top: '40%',
    backgroundColor: 'rgba(0,0,0,0.35)', borderRadius: 20, padding: 6,
  },
  detailTitleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  actionRow: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  primaryButton: {
    borderRadius: Radius.md,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: Spacing.sm,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  secondaryButton: {
    flex: 1,
    borderRadius: Radius.md,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
  },
  secondaryButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  dangerButton: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  infoBanner: {
    backgroundColor: '#EFF6FF',
    borderColor: '#BFDBFE',
    borderWidth: 1,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginTop: Spacing.sm,
  },
  infoBannerText: {
    color: '#1D4ED8',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
});
