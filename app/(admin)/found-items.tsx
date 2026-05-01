import { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  RefreshControl, Modal, ScrollView, Image, TextInput,
  Alert, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import LoadingModal from '../../components/LoadingModal';
import {
  ChevronLeft, ChevronRight, MapPin, Calendar, X, Check,
  Plus, Camera, ChevronDown, PackageCheck,
} from 'lucide-react-native';
import { supabase } from '../../lib/supabase';
import { useTheme } from '../../lib/ThemeContext';
import { Spacing, Radius } from '../../constants/theme';
import { attachNotificationTarget } from '../../lib/notificationTargets';

const FILTERS = ['all', 'approved', 'rejected'] as const;
type Filter = typeof FILTERS[number];

const FILTER_LABEL: Record<Filter, string> = {
  all: 'All', approved: 'Approved', rejected: 'Rejected',
};

const STATUS_COLOR_BASE: Record<string, string> = {
  pending_review: '#F59E0B',
  approved: '#10B981',
  rejected: '#EF4444',
  waiting_submission: '#3B82F6',
};

type FoundReport = {
  id: string;
  user_id: string;
  item_description: string;
  location: string;
  date_time: string;
  photos: string[];
  possession: 'with_student' | 'submitted_to_sdfo';
  status: string;
  rejection_reason?: string;
  created_at: string;
  reporter_name?: string;
  reporter_student_id?: string;
  reporter_contact?: string;
};

const ONE_YEAR_AGO = new Date();
ONE_YEAR_AGO.setFullYear(ONE_YEAR_AGO.getFullYear() - 1);
const FOUND_BUCKET = 'found-items';

const resolvePhotoUrl = (uri: string): string => {
  if (!uri || uri.startsWith('http')) return uri;
  return supabase.storage.from(FOUND_BUCKET).getPublicUrl(uri).data.publicUrl;
};

export default function FoundItemsScreen() {
  const { colors, isDark } = useTheme();
  const STATUS_COLOR: Record<string, string> = { ...STATUS_COLOR_BASE, submitted_to_sdfo: colors.primary };
  const [reports, setReports] = useState<FoundReport[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const [adminId, setAdminId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState<FoundReport | null>(null);
  const [photoIndex, setPhotoIndex] = useState(0);
  const [rejecting, setRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [imgErrors, setImgErrors] = useState<Record<string, boolean>>({});

  // Create Found Entry modal state
  const [showCreate, setShowCreate] = useState(false);
  const [createDesc, setCreateDesc] = useState('');
  const [createLocation, setCreateLocation] = useState('');
  const [createPhotos, setCreatePhotos] = useState<string[]>([]);
  const [createMonth, setCreateMonth] = useState('');
  const [createDay, setCreateDay] = useState('');
  const [createYear, setCreateYear] = useState('');
  const [createHour, setCreateHour] = useState('');
  const [createMinute, setCreateMinute] = useState('');
  const [createAmpm, setCreateAmpm] = useState<'AM' | 'PM'>('AM');
  const [createAmpmModal, setCreateAmpmModal] = useState(false);
  const [createDateError, setCreateDateError] = useState('');
  const [createLoading, setCreateLoading] = useState(false);

  const createDayRef = useRef<TextInput>(null);
  const createYearRef = useRef<TextInput>(null);
  const createMinuteRef = useRef<TextInput>(null);

  const fetchReports = async () => {
    setFetchError(null);
    try {
      let query = supabase
        .from('found_reports')
        .select('id, user_id, item_description, location, date_time, photos, possession, status, rejection_reason, created_at')
        .order('created_at', { ascending: false });
      if (filter !== 'all') query = query.eq('status', filter);

      const { data: reportData, error: reportError } = await query;
      if (reportError) { setFetchError(reportError.message); setReports([]); return; }
      if (!reportData || reportData.length === 0) { setReports([]); return; }

      const userIds = [...new Set(reportData.map((r: any) => r.user_id).filter(Boolean))];
      let userMap: Record<string, { name: string; student_id: string; contact: string }> = {};

      if (userIds.length > 0) {
        const { data: userData } = await supabase
          .from('users')
          .select('id, name, student_id, contact')
          .in('id', userIds);

        console.log('[userMap debug] expected:', userIds.length, 'got:', userData?.length ?? 0);

        if (userData) {
          userData.forEach((u: any) => {
            userMap[u.id] = {
              name: u.name ?? '(unavailable)',
              student_id: u.student_id ?? '—',
              contact: u.contact ?? '—',
            };
          });
        }
      }

      const merged: FoundReport[] = reportData.map((r: any) => ({
        ...r,
        photos: Array.isArray(r.photos) ? r.photos : [],
        reporter_name: userMap[r.user_id]?.name ?? '(unavailable)',
        reporter_student_id: userMap[r.user_id]?.student_id ?? '—',
        reporter_contact: userMap[r.user_id]?.contact ?? '—',
      }));

      setReports(merged);
    } catch (e: any) {
      setFetchError(e?.message ?? 'Unknown error');
      setReports([]);
    }
  };

  const load = async () => { setLoading(true); await fetchReports(); setLoading(false); };
  const onRefresh = useCallback(async () => { setRefreshing(true); await fetchReports(); setRefreshing(false); }, [filter]);
  useEffect(() => { load(); }, [filter]);
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => { if (user) setAdminId(user.id); });
  }, []);

  const handleApprove = async () => {
    if (!selected) return;
    setActionLoading(true);
    try {
      await supabase.from('found_reports').update({ status: 'approved' }).eq('id', selected.id);
      await supabase.from('notifications').insert({
        user_id: selected.user_id,
        type: 'found_approved',
        message: attachNotificationTarget(
          `Your found report for "${selected.item_description}" has been approved by SDFO.`,
          { kind: 'found', id: selected.id }
        ),
      });
      Alert.alert('Approved', 'Found report approved and student notified.');
      setSelected(null); fetchReports();
    } catch (e: any) { Alert.alert('Error', e?.message); }
    setActionLoading(false);
  };

  const handleReject = async () => {
    if (!selected || !rejectReason.trim()) return Alert.alert('Required', 'Please enter a rejection reason.');
    setActionLoading(true);
    try {
      await supabase.from('found_reports').update({ status: 'rejected', rejection_reason: rejectReason.trim() }).eq('id', selected.id);
      await supabase.from('notifications').insert({
        user_id: selected.user_id,
        type: 'found_rejected',
        message: attachNotificationTarget(
          `Your found report for "${selected.item_description}" was rejected. Reason: ${rejectReason.trim()}`,
          { kind: 'found', id: selected.id }
        ),
      });
      Alert.alert('Rejected', 'Found report has been rejected.');
      setSelected(null); setRejecting(false); setRejectReason(''); fetchReports();
    } catch (e: any) { Alert.alert('Error', e?.message); }
    setActionLoading(false);
  };

  // Request student to surrender item
  const handleRequestSurrender = async () => {
    if (!selected) return;
    Alert.alert(
      'Request Surrender',
      `Send a notification asking ${selected.reporter_name} to bring the item to SDFO?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send Request', onPress: async () => {
            setActionLoading(true);
            try {
              await supabase.from('found_reports').update({ status: 'waiting_submission' }).eq('id', selected.id);
              await supabase.from('notifications').insert({
                user_id: selected.user_id,
                type: 'surrender_requested',
                message: attachNotificationTarget(
                  `Please submit "${selected.item_description}" to the SDFO office so we can proceed with matching.`,
                  { kind: 'found', id: selected.id }
                ),
              });
              Alert.alert('Request Sent', 'Student has been notified to surrender the item.');
              setSelected(null); fetchReports();
            } catch (e: any) { Alert.alert('Error', e?.message); }
            setActionLoading(false);
          },
        },
      ]
    );
  };

  // Mark item as received from student
  const handleMarkReceived = async () => {
    if (!selected) return;
    setActionLoading(true);
    try {
      await supabase.from('found_reports').update({
        status: 'approved',
        possession: 'submitted_to_sdfo',
      }).eq('id', selected.id);
      await supabase.from('notifications').insert({
        user_id: selected.user_id,
        type: 'item_received',
        message: attachNotificationTarget(
          `SDFO has confirmed receipt of "${selected.item_description}". Matching process will begin shortly.`,
          { kind: 'found', id: selected.id }
        ),
      });
      Alert.alert('Received', 'Item marked as received. It is now available for matching.');
      setSelected(null); fetchReports();
    } catch (e: any) { Alert.alert('Error', e?.message); }
    setActionLoading(false);
  };

  // ── Create Found Entry ─────────────────────────────────────────────────────
  const buildCreateDate = (): Date | null => {
    const mm = parseInt(createMonth, 10);
    const dd = parseInt(createDay, 10);
    const yyyy = parseInt(createYear, 10);
    let hh = parseInt(createHour, 10);
    const min = parseInt(createMinute, 10);
    if (!mm || !dd || !yyyy || isNaN(hh) || isNaN(min)) return null;
    if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
    if (yyyy < 1000 || yyyy > new Date().getFullYear()) return null;
    if (hh < 1 || hh > 12 || min < 0 || min > 59) return null;
    if (createAmpm === 'PM' && hh !== 12) hh += 12;
    if (createAmpm === 'AM' && hh === 12) hh = 0;
    const d = new Date(yyyy, mm - 1, dd, hh, min, 0);
    if (isNaN(d.getTime()) || d > new Date() || d < ONE_YEAR_AGO) return null;
    return d;
  };

  const pickCreatePhoto = async () => {
    if (createPhotos.length >= 5) return;
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
    if (!result.canceled) setCreatePhotos(p => [...p, result.assets[0].uri]);
  };

  const uploadCreatePhotos = async (userId: string): Promise<string[]> => {
    const urls: string[] = [];
    for (const uri of createPhotos) {
      if (uri.startsWith('http')) { urls.push(uri); continue; }
      try {
        const rawExt = uri.split('.').pop()?.split('?')[0]?.toLowerCase() || 'jpeg';
        const ext = rawExt === 'jpg' ? 'jpeg' : rawExt;
        const path = `admin/${userId}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
        const base64 = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' });
        const byteChars = atob(base64);
        const byteArray = new Uint8Array(byteChars.length);
        for (let i = 0; i < byteChars.length; i++) byteArray[i] = byteChars.charCodeAt(i);
        const { error } = await supabase.storage
          .from(FOUND_BUCKET)
          .upload(path, byteArray, { contentType: `image/${ext}`, upsert: true });
        if (error) { console.warn('[upload]', error.message); continue; }
        const { data } = supabase.storage.from(FOUND_BUCKET).getPublicUrl(path);
        urls.push(data.publicUrl);
      } catch (e: any) { console.warn('[upload exception]', e?.message); }
    }
    return urls;
  };

  const handleCreateEntry = async () => {
    if (!createDesc.trim() || !createLocation.trim()) {
      return Alert.alert('Missing fields', 'Please fill in description and location.');
    }
    if (!createMonth || !createDay || !createYear || !createHour || !createMinute) {
      setCreateDateError('Please fill in all date and time fields.'); return;
    }
    const parsedDate = buildCreateDate();
    if (!parsedDate) {
      setCreateDateError('Invalid date or time.'); return;
    }
    setCreateDateError('');
    setCreateLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not logged in');

      const uploadedPhotos = createPhotos.length > 0 ? await uploadCreatePhotos(user.id) : [];

      const { error } = await supabase.from('found_reports').insert({
        user_id: user.id,
        item_description: createDesc.trim(),
        location: createLocation.trim(),
        date_time: parsedDate.toISOString(),
        photos: uploadedPhotos,
        possession: 'submitted_to_sdfo',
        status: 'approved',
      });
      if (error) throw error;

      Alert.alert('Entry Created', 'Found item entry has been added and is ready for matching.');
      setShowCreate(false);
      resetCreateForm();
      setFilter('all');
      fetchReports();
    } catch (e: any) { Alert.alert('Error', e?.message); }
    setCreateLoading(false);
  };

  const resetCreateForm = () => {
    setCreateDesc(''); setCreateLocation(''); setCreatePhotos([]);
    setCreateMonth(''); setCreateDay(''); setCreateYear('');
    setCreateHour(''); setCreateMinute(''); setCreateAmpm('AM');
    setCreateDateError('');
  };

  // ── Dynamic styles ────────────────────────────────────────────────────────
  const s = StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.background },
    header: {
      backgroundColor: colors.surface, paddingHorizontal: Spacing.xl, paddingVertical: Spacing.lg,
      borderBottomWidth: 1, borderBottomColor: colors.border,
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    },
    headerTitle: { fontSize: 20, fontWeight: '800', color: colors.text },
    headerSub: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
    createBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 5,
      backgroundColor: colors.primary, borderRadius: Radius.md,
      paddingHorizontal: Spacing.md, paddingVertical: 8,
    },
    createBtnText: { fontSize: 13, fontWeight: '700', color: '#fff' },
    filterScroll: { flexGrow: 0, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
    filterContent: { paddingHorizontal: Spacing.xl, paddingVertical: Spacing.sm, gap: Spacing.sm },
    filterPill: { paddingHorizontal: Spacing.md, paddingVertical: 6, borderRadius: Radius.full, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
    filterPillActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    filterText: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
    filterTextActive: { color: '#fff' },
    card: { backgroundColor: colors.surface, borderRadius: Radius.lg, marginBottom: Spacing.md, borderWidth: 1, borderColor: colors.border, overflow: 'hidden', elevation: 1 },
    cardImg: { width: '100%', height: 140 },
    cardImgEmpty: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.gray100 },
    cardBody: { padding: Spacing.md, gap: 4 },
    cardRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: Spacing.sm },
    cardName: { flex: 1, fontSize: 14, fontWeight: '700', color: colors.text },
    statusBadge: { paddingHorizontal: Spacing.sm, paddingVertical: 3, borderRadius: Radius.full },
    statusText: { fontSize: 10, fontWeight: '700', color: '#fff', textTransform: 'capitalize' },
    metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    metaText: { fontSize: 12, color: colors.textSecondary },
    cardUser: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
    empty: { alignItems: 'center', marginTop: 80, gap: Spacing.md },
    emptyText: { fontSize: 16, fontWeight: '700', color: colors.textSecondary },
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
    sheet: { backgroundColor: colors.surface, borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl, maxHeight: '92%' },
    sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginTop: Spacing.md },
    closeBtn: { position: 'absolute', top: Spacing.lg, right: Spacing.lg, zIndex: 10 },
    gallery: { height: 220, backgroundColor: colors.gray100 },
    galleryImg: { width: '100%', height: 220 },
    galleryEmpty: { alignItems: 'center', justifyContent: 'center' },
    navBtn: { position: 'absolute', top: '40%', backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: 20, padding: 6 },
    dots: { position: 'absolute', bottom: Spacing.sm, width: '100%', flexDirection: 'row', justifyContent: 'center', gap: 6 },
    dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.5)' },
    dotActive: { backgroundColor: '#fff', width: 16 },
    sheetBody: { padding: Spacing.xl, gap: Spacing.lg },
    statusRow: { alignSelf: 'flex-start', paddingHorizontal: Spacing.md, paddingVertical: 4, borderRadius: Radius.full },
    sheetStatus: { fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
    sheetTitle: { fontSize: 18, fontWeight: '800', color: colors.text },
    infoGrid: { gap: Spacing.sm },
    infoRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
    infoText: { fontSize: 13, color: colors.textSecondary, flex: 1 },
    reporterCard: { backgroundColor: colors.gray100, borderRadius: Radius.md, padding: Spacing.md, gap: 4 },
    reporterLabel: { fontSize: 11, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
    reporterName: { fontSize: 15, fontWeight: '700', color: colors.text },
    reporterSub: { fontSize: 12, color: colors.textSecondary },
    possessionBadge: { alignSelf: 'flex-start', marginTop: 4, paddingHorizontal: Spacing.sm, paddingVertical: 4, borderRadius: Radius.sm },
    possessionText: { fontSize: 12, fontWeight: '600' },
    rejectionBox: { backgroundColor: colors.error + '10', borderRadius: Radius.md, padding: Spacing.md, borderWidth: 1, borderColor: colors.error + '30' },
    rejectionLabel: { fontSize: 11, fontWeight: '700', color: colors.error, marginBottom: 4 },
    rejectionText: { fontSize: 13, color: colors.error },
    actionRow: { flexDirection: 'row', gap: Spacing.md, marginBottom: Spacing.lg },
    rejectBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, paddingVertical: 14, borderRadius: Radius.md, borderWidth: 1, borderColor: colors.error, backgroundColor: colors.error + '10' },
    rejectBtnText: { fontSize: 14, fontWeight: '700', color: colors.error },
    approveBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, paddingVertical: 14, borderRadius: Radius.md, backgroundColor: colors.success },
    approveBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
    surrenderBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, paddingVertical: 14, borderRadius: Radius.md, backgroundColor: '#F59E0B', marginBottom: Spacing.lg },
    surrenderBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
    receivedBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, paddingVertical: 14, borderRadius: Radius.md, backgroundColor: colors.success, marginBottom: Spacing.lg },
    receivedBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
    rejectForm: { gap: Spacing.md, marginBottom: Spacing.lg },
    rejectFormLabel: { fontSize: 13, fontWeight: '600', color: colors.text },
    rejectInput: { backgroundColor: colors.gray100, borderRadius: Radius.md, padding: Spacing.md, fontSize: 14, color: colors.text, borderWidth: 1, borderColor: colors.border, height: 100, textAlignVertical: 'top' },
    rejectActions: { flexDirection: 'row', gap: Spacing.md },
    cancelBtn: { flex: 1, paddingVertical: 14, borderRadius: Radius.md, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
    cancelBtnText: { fontSize: 14, fontWeight: '600', color: colors.textSecondary },
    confirmRejectBtn: { flex: 1, paddingVertical: 14, borderRadius: Radius.md, alignItems: 'center', backgroundColor: colors.error },
    confirmRejectBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
    createHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.xl, paddingVertical: Spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border },
    createHeaderTitle: { fontSize: 17, fontWeight: '800', color: colors.text },
    createInfoBox: { backgroundColor: colors.primaryMuted, borderRadius: Radius.md, padding: Spacing.md, marginBottom: Spacing.md },
    createInfoText: { fontSize: 13, color: colors.primary, lineHeight: 20 },
    createLabel: { fontSize: 13, fontWeight: '600', color: colors.text, marginBottom: 6 },
    createSublabel: { fontSize: 11, color: colors.textMuted, marginBottom: 6 },
    createInput: { backgroundColor: colors.gray100, borderRadius: Radius.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.md, fontSize: 14, color: colors.text, borderWidth: 1, borderColor: colors.border },
    dateRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    dateSeg: { width: 52, borderRadius: Radius.md, borderWidth: 1, paddingHorizontal: 6, paddingVertical: Spacing.md, fontSize: 15, textAlign: 'center', fontWeight: '600', color: colors.text, backgroundColor: colors.gray100 },
    yearSeg: { width: 72, borderRadius: Radius.md, borderWidth: 1, paddingHorizontal: 6, paddingVertical: Spacing.md, fontSize: 15, textAlign: 'center', fontWeight: '600', color: colors.text, backgroundColor: colors.gray100 },
    dateSep: { fontSize: 18, color: colors.textMuted, fontWeight: '300' },
    ampmBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: Radius.md, borderWidth: 1, paddingHorizontal: Spacing.md, paddingVertical: Spacing.md, backgroundColor: colors.gray100, minWidth: 66 },
    ampmText: { fontSize: 14, fontWeight: '600', color: colors.text },
    photoWrap: { position: 'relative', width: 80, height: 80 },
    photoThumb: { width: 80, height: 80, borderRadius: Radius.sm },
    removePhoto: { position: 'absolute', top: -5, right: -5, backgroundColor: colors.error, borderRadius: 10, width: 20, height: 20, alignItems: 'center', justifyContent: 'center' },
    addPhoto: { width: 80, height: 80, borderRadius: Radius.sm, borderWidth: 2, borderStyle: 'dashed', borderColor: colors.border, alignItems: 'center', justifyContent: 'center', gap: 3 },
    createSubmitBtn: { backgroundColor: colors.primary, borderRadius: Radius.md, paddingVertical: 14, alignItems: 'center', marginTop: Spacing.xl },
    createSubmitText: { color: '#fff', fontSize: 15, fontWeight: '700' },
    ampmOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.3)' },
    ampmDropdown: { backgroundColor: colors.surface, borderRadius: Radius.md, borderWidth: 1, borderColor: colors.border, overflow: 'hidden', minWidth: 120 },
    ampmOption: { paddingVertical: 14, paddingHorizontal: Spacing.xl, borderBottomWidth: 1, borderBottomColor: colors.border },
  });

  // ── Render ────────────────────────────────────────────────────────────────
  const renderItem = ({ item }: { item: FoundReport }) => {
    const color = STATUS_COLOR[item.status] ?? '#9CA3AF';
    const hasPhoto = item.photos?.length > 0 && !imgErrors[item.id];
    return (
      <TouchableOpacity
        style={s.card}
        onPress={() => { setSelected(item); setPhotoIndex(0); }}
        activeOpacity={0.9}
      >
        {hasPhoto ? (
          <Image
            source={{ uri: resolvePhotoUrl(item.photos[0]) }}
            style={s.cardImg}
            resizeMode="cover"
            onError={() => setImgErrors(e => ({ ...e, [item.id]: true }))}
          />
        ) : (
          <View style={[s.cardImg, s.cardImgEmpty]}>
            <Text style={{ fontSize: 32 }}>📦</Text>
          </View>
        )}
        <View style={s.cardBody}>
          <View style={s.cardRow}>
            <Text style={s.cardName} numberOfLines={2}>{item.item_description}</Text>
            <View style={[s.statusBadge, { backgroundColor: color }]}>
              <Text style={s.statusText}>{item.status.replace(/_/g, ' ')}</Text>
            </View>
          </View>
          <View style={s.metaRow}>
            <MapPin size={12} color={colors.textMuted} />
            <Text style={s.metaText} numberOfLines={1}>{item.location}</Text>
          </View>
          <View style={s.metaRow}>
            <Calendar size={12} color={colors.textMuted} />
            <Text style={s.metaText}>
              {new Date(item.date_time).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
            </Text>
          </View>
          <Text style={s.cardUser}>By: {item.reporter_name}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  const modalPhotoOk = selected && selected.photos?.length > 0 && !imgErrors[selected.id + '_modal'];

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <View>
          <Text style={s.headerTitle}>Found Reports</Text>
          <Text style={s.headerSub}>Review & approve submitted reports</Text>
        </View>
        <TouchableOpacity style={s.createBtn} onPress={() => setShowCreate(true)}>
          <Plus size={18} color="#fff" />
          <Text style={s.createBtnText}>Add Entry</Text>
        </TouchableOpacity>
      </View>

      {/* Filter Pills */}
      <ScrollView
        horizontal showsHorizontalScrollIndicator={false}
        style={s.filterScroll} contentContainerStyle={s.filterContent}
      >
        {FILTERS.map(f => (
          <TouchableOpacity
            key={f}
            style={[s.filterPill, filter === f && s.filterPillActive]}
            onPress={() => setFilter(f)}
          >
            <Text style={[s.filterText, filter === f && s.filterTextActive]}>{FILTER_LABEL[f]}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 60 }} size="large" color={colors.primary} />
      ) : fetchError ? (
        <View style={s.empty}>
          <Text style={{ fontSize: 32 }}>⚠️</Text>
          <Text style={[s.emptyText, { color: colors.error }]}>Failed to load</Text>
          <Text style={{ fontSize: 12, color: colors.textMuted, textAlign: 'center', marginTop: 4 }}>{fetchError}</Text>
          <TouchableOpacity onPress={load} style={{ marginTop: 16, padding: 12, backgroundColor: colors.primary, borderRadius: Radius.md }}>
            <Text style={{ color: '#fff', fontWeight: '700' }}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={reports}
          keyExtractor={i => i.id}
          renderItem={renderItem}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
          contentContainerStyle={{ padding: Spacing.xl, paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={s.empty}>
              <Text style={{ fontSize: 40 }}>📋</Text>
              <Text style={s.emptyText}>No {FILTER_LABEL[filter].toLowerCase()} reports</Text>
            </View>
          }
        />
      )}

      {/* ── Detail Modal ───────────────────────────────────────────────────── */}
      <Modal
        visible={!!selected}
        animationType="slide"
        transparent
        onRequestClose={() => { setSelected(null); setRejecting(false); setRejectReason(''); }}
      >
        <TouchableOpacity
          style={s.overlay}
          activeOpacity={1}
          onPress={() => { setSelected(null); setRejecting(false); setRejectReason(''); }}
        >
          <TouchableOpacity activeOpacity={1} style={s.sheet}>
            <View style={s.sheetHandle} />
            <TouchableOpacity style={s.closeBtn} onPress={() => { setSelected(null); setRejecting(false); setRejectReason(''); }}>
              <X size={20} color={colors.textSecondary} />
            </TouchableOpacity>

            {selected && (
              <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                {/* Gallery */}
                <View style={s.gallery}>
                  {modalPhotoOk ? (
                    <>
                      <Image
                        source={{ uri: resolvePhotoUrl(selected.photos[photoIndex]) }}
                        style={s.galleryImg}
                        resizeMode="cover"
                        onError={() => setImgErrors(e => ({ ...e, [selected.id + '_modal']: true }))}
                      />
                      {selected.photos.length > 1 && (
                        <>
                          {photoIndex > 0 && (
                            <TouchableOpacity style={[s.navBtn, { left: Spacing.sm }]} onPress={() => setPhotoIndex(p => p - 1)}>
                              <ChevronLeft size={18} color="#fff" />
                            </TouchableOpacity>
                          )}
                          {photoIndex < selected.photos.length - 1 && (
                            <TouchableOpacity style={[s.navBtn, { right: Spacing.sm }]} onPress={() => setPhotoIndex(p => p + 1)}>
                              <ChevronRight size={18} color="#fff" />
                            </TouchableOpacity>
                          )}
                          <View style={s.dots}>
                            {selected.photos.map((_, i) => (
                              <View key={i} style={[s.dot, i === photoIndex && s.dotActive]} />
                            ))}
                          </View>
                        </>
                      )}
                    </>
                  ) : (
                    <View style={[s.galleryImg, s.galleryEmpty]}>
                      <Text style={{ fontSize: 60 }}>📦</Text>
                    </View>
                  )}
                </View>

                <View style={s.sheetBody}>
                  <View style={[s.statusRow, { backgroundColor: (STATUS_COLOR[selected.status] ?? '#9CA3AF') + '18' }]}>
                    <Text style={[s.sheetStatus, { color: STATUS_COLOR[selected.status] ?? '#9CA3AF' }]}>
                      {selected.status.replace(/_/g, ' ').toUpperCase()}
                    </Text>
                  </View>

                  <Text style={s.sheetTitle}>{selected.item_description}</Text>

                  <View style={s.infoGrid}>
                    <View style={s.infoRow}>
                      <MapPin size={14} color={colors.primary} />
                      <Text style={s.infoText}>{selected.location}</Text>
                    </View>
                    <View style={s.infoRow}>
                      <Calendar size={14} color={colors.primary} />
                      <Text style={s.infoText}>
                        {new Date(selected.date_time).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                        {' · '}
                        {new Date(selected.date_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
                      </Text>
                    </View>
                  </View>

                  <View style={s.reporterCard}>
                    <Text style={s.reporterLabel}>Reported By</Text>
                    <Text style={s.reporterName}>{selected.reporter_name}</Text>
                    <Text style={s.reporterSub}>ID: {selected.reporter_student_id} · {selected.reporter_contact}</Text>
                    <View style={[s.possessionBadge, {
                      backgroundColor: selected.possession === 'with_student' ? colors.warning + '20' : colors.primary + '20',
                    }]}>
                      <Text style={[s.possessionText, {
                        color: selected.possession === 'with_student' ? colors.warning : colors.primary,
                      }]}>
                        {selected.possession === 'with_student' ? '📦 Item still with student' : '🏛 Submitted to SDFO'}
                      </Text>
                    </View>
                  </View>

                  {selected.rejection_reason ? (
                    <View style={s.rejectionBox}>
                      <Text style={s.rejectionLabel}>Rejection Reason</Text>
                      <Text style={s.rejectionText}>{selected.rejection_reason}</Text>
                    </View>
                  ) : null}

                  {/* Delete button for admin-created entries */}
                  {adminId && selected.user_id === adminId && (
                    <TouchableOpacity
                      style={[s.rejectBtn, { marginBottom: Spacing.lg }]}
                      onPress={() => Alert.alert('Delete Entry', 'Delete this admin-created entry?', [
                        { text: 'Cancel', style: 'cancel' },
                        {
                          text: 'Delete', style: 'destructive', onPress: async () => {
                            await supabase.from('found_reports').delete().eq('id', selected.id);
                            setSelected(null); fetchReports();
                          },
                        },
                      ])}
                    >
                      <X size={16} color={colors.error} />
                      <Text style={s.rejectBtnText}>Delete Entry</Text>
                    </TouchableOpacity>
                  )}

                  {/* Actions based on status + possession */}
                  {selected.status === 'pending_review' && (
                    rejecting ? (
                      <View style={s.rejectForm}>
                        <Text style={s.rejectFormLabel}>Rejection Reason <Text style={{ color: colors.error }}>*</Text></Text>
                        <TextInput
                          style={s.rejectInput}
                          placeholder="Enter reason for rejection..."
                          placeholderTextColor={colors.textMuted}
                          value={rejectReason}
                          onChangeText={setRejectReason}
                          multiline
                        />
                        <View style={s.rejectActions}>
                          <TouchableOpacity style={s.cancelBtn} onPress={() => { setRejecting(false); setRejectReason(''); }}>
                            <Text style={s.cancelBtnText}>Cancel</Text>
                          </TouchableOpacity>
                          <TouchableOpacity style={s.confirmRejectBtn} onPress={handleReject} disabled={actionLoading}>
                            <Text style={s.confirmRejectBtnText}>{actionLoading ? 'Rejecting...' : 'Confirm Reject'}</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    ) : selected.possession === 'with_student' ? (
                      /* Item still with student — request return before approving */
                      <View style={s.actionRow}>
                        <TouchableOpacity style={s.rejectBtn} onPress={() => setRejecting(true)}>
                          <X size={16} color={colors.error} />
                          <Text style={s.rejectBtnText}>Reject</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={s.surrenderBtn} onPress={handleRequestSurrender} disabled={actionLoading}>
                          <PackageCheck size={16} color="#fff" />
                          <Text style={s.surrenderBtnText}>{actionLoading ? 'Sending...' : 'Request Item Return'}</Text>
                        </TouchableOpacity>
                      </View>
                    ) : (
                      /* Submitted to SDFO — allow direct approval */
                      <View style={s.actionRow}>
                        <TouchableOpacity style={s.rejectBtn} onPress={() => setRejecting(true)}>
                          <X size={16} color={colors.error} />
                          <Text style={s.rejectBtnText}>Reject</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={s.approveBtn} onPress={handleApprove} disabled={actionLoading}>
                          <Check size={16} color="#fff" />
                          <Text style={s.approveBtnText}>{actionLoading ? 'Approving...' : 'Approve'}</Text>
                        </TouchableOpacity>
                      </View>
                    )
                  )}

                  {/* Waiting submission → confirm receipt & approve */}
                  {selected.status === 'waiting_submission' && (
                    <TouchableOpacity style={s.receivedBtn} onPress={handleMarkReceived} disabled={actionLoading}>
                      <Check size={16} color="#fff" />
                      <Text style={s.receivedBtnText}>{actionLoading ? 'Updating...' : 'Confirm Receipt & Approve'}</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </ScrollView>
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* ── Create Found Entry Modal ───────────────────────────────────────── */}
      <Modal
        visible={showCreate}
        animationType="slide"
        transparent
        onRequestClose={() => { setShowCreate(false); resetCreateForm(); }}
      >
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <TouchableOpacity
            style={s.overlay}
            activeOpacity={1}
            onPress={() => { setShowCreate(false); resetCreateForm(); }}
          >
            <TouchableOpacity activeOpacity={1} style={[s.sheet, { maxHeight: '95%' }]}>
              <View style={s.sheetHandle} />
              <View style={s.createHeader}>
                <Text style={s.createHeaderTitle}>Create Found Entry</Text>
                <TouchableOpacity onPress={() => { setShowCreate(false); resetCreateForm(); }}>
                  <X size={20} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>

              <ScrollView
                style={{ padding: Spacing.xl }}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                <View style={s.createInfoBox}>
                  <Text style={s.createInfoText}>
                    This creates a found item entry on behalf of SDFO. It will be immediately approved and available for matching.
                  </Text>
                </View>

                <Text style={s.createLabel}>Item Description <Text style={{ color: colors.error }}>*</Text></Text>
                <TextInput
                  style={[s.createInput, { height: 90, textAlignVertical: 'top' }]}
                  placeholder="Describe the found item in detail..."
                  placeholderTextColor={colors.textMuted}
                  value={createDesc}
                  onChangeText={setCreateDesc}
                  multiline
                />

                <Text style={[s.createLabel, { marginTop: Spacing.md }]}>Location Found <Text style={{ color: colors.error }}>*</Text></Text>
                <TextInput
                  style={s.createInput}
                  placeholder="e.g. Library 2nd Floor"
                  placeholderTextColor={colors.textMuted}
                  value={createLocation}
                  onChangeText={setCreateLocation}
                />

                <Text style={[s.createLabel, { marginTop: Spacing.md }]}>Date Found <Text style={{ color: colors.error }}>*</Text></Text>
                <Text style={s.createSublabel}>MM / DD / YYYY</Text>
                <View style={s.dateRow}>
                  <TextInput
                    style={[s.dateSeg, { borderColor: createDateError ? colors.error : colors.border }]}
                    placeholder="MM" placeholderTextColor={colors.textMuted}
                    value={createMonth} keyboardType="numeric" maxLength={2}
                    onChangeText={v => {
                      const c = v.replace(/\D/g, '').slice(0, 2);
                      setCreateMonth(c); setCreateDateError('');
                      if (c.length === 2) createDayRef.current?.focus();
                    }}
                  />
                  <Text style={s.dateSep}>/</Text>
                  <TextInput
                    ref={createDayRef}
                    style={[s.dateSeg, { borderColor: createDateError ? colors.error : colors.border }]}
                    placeholder="DD" placeholderTextColor={colors.textMuted}
                    value={createDay} keyboardType="numeric" maxLength={2}
                    onChangeText={v => {
                      const c = v.replace(/\D/g, '').slice(0, 2);
                      setCreateDay(c); setCreateDateError('');
                      if (c.length === 2) createYearRef.current?.focus();
                    }}
                  />
                  <Text style={s.dateSep}>/</Text>
                  <TextInput
                    ref={createYearRef}
                    style={[s.yearSeg, { borderColor: createDateError ? colors.error : colors.border }]}
                    placeholder="YYYY" placeholderTextColor={colors.textMuted}
                    value={createYear} keyboardType="numeric" maxLength={4}
                    onChangeText={v => { setCreateYear(v.replace(/\D/g, '').slice(0, 4)); setCreateDateError(''); }}
                  />
                </View>

                <Text style={[s.createLabel, { marginTop: Spacing.md }]}>Time Found <Text style={{ color: colors.error }}>*</Text></Text>
                <Text style={s.createSublabel}>HH : MM</Text>
                <View style={s.dateRow}>
                  <TextInput
                    style={[s.dateSeg, { borderColor: createDateError ? colors.error : colors.border }]}
                    placeholder="HH" placeholderTextColor={colors.textMuted}
                    value={createHour} keyboardType="numeric" maxLength={2}
                    onChangeText={v => {
                      const c = v.replace(/\D/g, '').slice(0, 2);
                      setCreateHour(c); setCreateDateError('');
                      if (c.length === 2) createMinuteRef.current?.focus();
                    }}
                  />
                  <Text style={s.dateSep}>:</Text>
                  <TextInput
                    ref={createMinuteRef}
                    style={[s.dateSeg, { borderColor: createDateError ? colors.error : colors.border }]}
                    placeholder="MM" placeholderTextColor={colors.textMuted}
                    value={createMinute} keyboardType="numeric" maxLength={2}
                    onChangeText={v => { setCreateMinute(v.replace(/\D/g, '').slice(0, 2)); setCreateDateError(''); }}
                  />
                  <TouchableOpacity
                    style={[s.ampmBtn, { borderColor: createDateError ? colors.error : colors.border }]}
                    onPress={() => setCreateAmpmModal(true)}
                  >
                    <Text style={s.ampmText}>{createAmpm}</Text>
                    <ChevronDown size={13} color={colors.textMuted} />
                  </TouchableOpacity>
                </View>
                {createDateError ? (
                  <Text style={{ fontSize: 11, color: colors.error, marginTop: 3 }}>{createDateError}</Text>
                ) : null}

                <Text style={[s.createLabel, { marginTop: Spacing.md }]}>Photos (optional)</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginBottom: Spacing.sm }}>
                  {createPhotos.map((uri, i) => (
                    <View key={i} style={s.photoWrap}>
                      <Image source={{ uri }} style={s.photoThumb} resizeMode="cover" />
                      <TouchableOpacity
                        style={s.removePhoto}
                        onPress={() => setCreatePhotos(p => p.filter((_, j) => j !== i))}
                      >
                        <X size={12} color="#fff" />
                      </TouchableOpacity>
                    </View>
                  ))}
                  {createPhotos.length < 5 && (
                    <TouchableOpacity style={s.addPhoto} onPress={pickCreatePhoto}>
                      <Camera size={22} color={colors.textMuted} />
                      <Text style={{ fontSize: 10, color: colors.textMuted }}>Add</Text>
                    </TouchableOpacity>
                  )}
                </View>

                <TouchableOpacity
                  style={[s.createSubmitBtn, createLoading && { opacity: 0.5 }]}
                  onPress={handleCreateEntry}
                  disabled={createLoading}
                >
                  <Text style={s.createSubmitText}>{createLoading ? 'Creating...' : 'Create Found Entry'}</Text>
                </TouchableOpacity>

                <View style={{ height: Spacing.xxxl }} />
              </ScrollView>
            </TouchableOpacity>
          </TouchableOpacity>
        </KeyboardAvoidingView>
      </Modal>

      <LoadingModal visible={createLoading} message="Creating entry..." />

      {/* AM/PM picker for create form */}
      <Modal visible={createAmpmModal} transparent animationType="fade" onRequestClose={() => setCreateAmpmModal(false)}>
        <TouchableOpacity style={s.ampmOverlay} activeOpacity={1} onPress={() => setCreateAmpmModal(false)}>
          <View style={s.ampmDropdown}>
            {(['AM', 'PM'] as const).map(opt => (
              <TouchableOpacity
                key={opt}
                style={[s.ampmOption, createAmpm === opt && { backgroundColor: colors.primary + '20' }]}
                onPress={() => { setCreateAmpm(opt); setCreateAmpmModal(false); }}
              >
                <Text style={{ fontSize: 15, color: createAmpm === opt ? colors.primary : colors.text, fontWeight: createAmpm === opt ? '700' : '400', textAlign: 'center' }}>
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

