import { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, KeyboardAvoidingView, Platform, Image, Alert, Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { ChevronLeft, Camera, X, CheckCircle, ChevronDown } from 'lucide-react-native';
import { useTheme } from '../../lib/ThemeContext';
import { supabase } from '../../lib/supabase';
import { Spacing, Radius } from '../../constants/theme';
import * as FileSystem from 'expo-file-system/legacy';
import LoadingModal from '../../components/LoadingModal';

const ONE_YEAR_AGO = new Date();
ONE_YEAR_AGO.setFullYear(ONE_YEAR_AGO.getFullYear() - 1);

const FOUND_BUCKET = 'found-items';

export default function FoundScreen() {
  const { colors } = useTheme();
  const { lost_item_id, lost_item_name } = useLocalSearchParams<{
    lost_item_id?: string;
    lost_item_name?: string;
  }>();

  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [possession, setPossession] = useState<'with_student' | 'submitted_to_sdfo'>('with_student');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const [month, setMonth] = useState('');
  const [day, setDay] = useState('');
  const [year, setYear] = useState('');
  const [hour, setHour] = useState('');
  const [minute, setMinute] = useState('');
  const [ampm, setAmpm] = useState<'AM' | 'PM'>('AM');
  const [showAmPmDropdown, setShowAmPmDropdown] = useState(false);
  const [datetimeError, setDatetimeError] = useState('');

  const dayRef = useRef<TextInput>(null);
  const yearRef = useRef<TextInput>(null);
  const minuteRef = useRef<TextInput>(null);

  useFocusEffect(
    useCallback(() => {
      return () => {
        setSubmitted(false);
        setDescription('');
        setLocation('');
        setPhotos([]);
        setPossession('with_student');
        setMonth(''); setDay(''); setYear('');
        setHour(''); setMinute(''); setAmpm('AM');
        setDatetimeError('');
      };
    }, [])
  );

  useEffect(() => {
    if (!submitted) return;
    const t = setTimeout(() => {
      router.replace({ pathname: '/(student)/activity', params: { tab: 'found' } });
    }, 3000);
    return () => clearTimeout(t);
  }, [submitted]);

  const buildDate = (): Date | null => {
    const mm = parseInt(month, 10);
    const dd = parseInt(day, 10);
    const yyyy = parseInt(year, 10);
    let hh = parseInt(hour, 10);
    const min = parseInt(minute, 10);

    if (!mm || !dd || !yyyy || isNaN(hh) || isNaN(min)) return null;
    if (mm < 1 || mm > 12) return null;
    if (dd < 1 || dd > 31) return null;
    if (yyyy < 1000 || yyyy > new Date().getFullYear()) return null;
    if (hh < 1 || hh > 12) return null;
    if (min < 0 || min > 59) return null;

    if (ampm === 'PM' && hh !== 12) hh += 12;
    if (ampm === 'AM' && hh === 12) hh = 0;

    const d = new Date(yyyy, mm - 1, dd, hh, min, 0);
    if (isNaN(d.getTime())) return null;
    if (d > new Date()) return null;
    if (d < ONE_YEAR_AGO) return null;
    return d;
  };

  const pickImage = async () => {
    if (photos.length >= 5) return Alert.alert('Max 5 photos allowed');
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.7,
    });
    if (!result.canceled) setPhotos(p => [...p, result.assets[0].uri]);
  };

  const uploadPhotos = async (userId: string): Promise<string[]> => {
    const urls: string[] = [];
    for (const uri of photos) {
      if (uri.startsWith('http')) { urls.push(uri); continue; }
      try {
        const rawExt = uri.split('.').pop()?.toLowerCase() || 'jpeg';
        const ext = rawExt === 'jpg' ? 'jpeg' : rawExt;
        const path = `${userId}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;

        const base64 = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' });
        const byteChars = atob(base64);
        const byteArray = new Uint8Array(byteChars.length);
        for (let i = 0; i < byteChars.length; i++) byteArray[i] = byteChars.charCodeAt(i);

        const { error: uploadError } = await supabase.storage
          .from(FOUND_BUCKET)
          .upload(path, byteArray, { contentType: `image/${ext}`, upsert: true });

        if (uploadError) { console.warn('[upload error]', uploadError.message); continue; }

        const { data: urlData } = supabase.storage.from(FOUND_BUCKET).getPublicUrl(path);
        if (urlData?.publicUrl) urls.push(urlData.publicUrl);
      } catch (err: any) { console.warn('[upload exception]', err.message); }
    }
    return urls;
  };

  const handleSubmit = async () => {
    if (!description.trim() || !location.trim()) {
      return Alert.alert('Missing fields', 'Please fill in description and location.');
    }
    if (photos.length < 3) {
      return Alert.alert('Photos required', 'Please add at least 3 photos.');
    }
    if (!month || !day || !year || !hour || !minute) {
      setDatetimeError('Please fill in all date and time fields.');
      return;
    }
    const parsedDate = buildDate();
    if (!parsedDate) {
      setDatetimeError('Invalid date or time. Must be within the last year and not in the future.');
      return;
    }
    setDatetimeError('');
    setLoading(true);

    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (!user || userError) throw new Error('Not logged in. Please log in again.');

      const uploadedPhotos = await uploadPhotos(user.id);

      if (uploadedPhotos.length === 0) {
        throw new Error('Photos failed to upload. Please try again.');
      }

      const { error: insertError } = await supabase.from('found_reports').insert({
        user_id: user.id,
        item_description: description.trim(),
        location: location.trim(),
        date_time: parsedDate.toISOString(),
        photos: uploadedPhotos,
        possession,
        status: 'pending_review',
      });

      if (insertError) throw new Error(insertError.message);

      if (lost_item_id) {
        await supabase
          .from('lost_items')
          .update({ status: 'possible_match' })
          .eq('id', lost_item_id)
          .eq('status', 'searching');
      }

      setSubmitted(true);
    } catch (e: any) {
      Alert.alert('Submission failed', e?.message ?? 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const s = StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.background },
    header: {
      flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.xl,
      paddingVertical: Spacing.lg, backgroundColor: colors.surface,
      borderBottomWidth: 1, borderBottomColor: colors.border, gap: Spacing.md,
    },
    headerTitle: { fontSize: 18, fontWeight: '700', color: colors.text },
    scroll: { padding: Spacing.xl },
    section: { marginBottom: Spacing.xl },
    label: { fontSize: 13, fontWeight: '600', color: colors.text, marginBottom: Spacing.sm },
    sublabel: { fontSize: 11, color: colors.textMuted, marginBottom: Spacing.sm },
    required: { color: colors.error },
    input: {
      backgroundColor: colors.surface, borderRadius: Radius.md,
      paddingHorizontal: Spacing.md, paddingVertical: Spacing.md,
      fontSize: 15, color: colors.text, borderWidth: 1, borderColor: colors.border,
    },
    textarea: { height: 100, textAlignVertical: 'top' },
    toggleRow: { flexDirection: 'row', gap: Spacing.md },
    toggleBtn: {
      flex: 1, borderRadius: Radius.md, paddingVertical: Spacing.md,
      paddingHorizontal: Spacing.md, borderWidth: 1, alignItems: 'center',
    },
    toggleBtnText: { fontSize: 13, fontWeight: '600', textAlign: 'center' },
    photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
    photoWrap: { position: 'relative', width: 90, height: 90 },
    photo: { width: 90, height: 90, borderRadius: Radius.sm },
    removePhoto: {
      position: 'absolute', top: -6, right: -6, backgroundColor: colors.error,
      borderRadius: 10, width: 20, height: 20, alignItems: 'center', justifyContent: 'center',
    },
    addPhoto: {
      width: 90, height: 90, borderRadius: Radius.sm, borderWidth: 2,
      borderStyle: 'dashed', borderColor: colors.border,
      alignItems: 'center', justifyContent: 'center', gap: 4,
    },
    addPhotoText: { fontSize: 11, color: colors.textSecondary },
    photoHint: { fontSize: 12, color: colors.textMuted, marginTop: Spacing.sm },
    submitBtn: {
      backgroundColor: colors.primary, borderRadius: Radius.md,
      paddingVertical: 16, alignItems: 'center', marginBottom: Spacing.xl,
    },
    submitBtnDisabled: { opacity: 0.6 },
    submitBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
    dateRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    dateSegment: {
      width: 52, borderRadius: Radius.md, borderWidth: 1,
      paddingHorizontal: 8, paddingVertical: Spacing.md,
      fontSize: 16, textAlign: 'center', fontWeight: '600',
    },
    yearSegment: {
      width: 72, borderRadius: Radius.md, borderWidth: 1,
      paddingHorizontal: 8, paddingVertical: Spacing.md,
      fontSize: 16, textAlign: 'center', fontWeight: '600',
    },
    dateSep: { fontSize: 20, fontWeight: '300', marginHorizontal: 2 },
    timeRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    timeSegment: {
      width: 52, borderRadius: Radius.md, borderWidth: 1,
      paddingHorizontal: 8, paddingVertical: Spacing.md,
      fontSize: 16, textAlign: 'center', fontWeight: '600',
    },
    ampmBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 4,
      borderRadius: Radius.md, borderWidth: 1,
      paddingHorizontal: Spacing.md, paddingVertical: Spacing.md, minWidth: 70,
    },
    ampmText: { fontSize: 15, fontWeight: '600' },
    errorText: { fontSize: 12, marginTop: 4, fontWeight: '500' },
    hint: { fontSize: 12, marginTop: 4 },
    modalOverlay: {
      flex: 1, justifyContent: 'center', alignItems: 'center',
      backgroundColor: 'rgba(0,0,0,0.3)',
    },
    dropdown: { borderRadius: Radius.md, borderWidth: 1, overflow: 'hidden', minWidth: 120 },
    dropdownItem: { paddingVertical: 14, paddingHorizontal: Spacing.xl, borderBottomWidth: 1 },
    dropdownText: { fontSize: 16, textAlign: 'center' },
    success: {
      flex: 1, alignItems: 'center', justifyContent: 'center',
      padding: Spacing.xl, gap: Spacing.lg,
    },
    successTitle: { fontSize: 24, fontWeight: '800', color: colors.text, textAlign: 'center' },
    successSub: { fontSize: 15, color: colors.textSecondary, textAlign: 'center', lineHeight: 24 },
    successBtn: {
      backgroundColor: colors.primary, borderRadius: Radius.md,
      paddingVertical: 14, paddingHorizontal: Spacing.xl, marginTop: Spacing.lg,
    },
    successBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
    infoBox: {
      backgroundColor: colors.primaryMuted, borderRadius: Radius.md,
      padding: Spacing.md, marginBottom: Spacing.xl,
    },
    infoText: { fontSize: 13, color: colors.primary, lineHeight: 20 },
    linkedBox: {
      backgroundColor: '#EFF6FF', borderRadius: Radius.md, padding: Spacing.md,
      marginBottom: Spacing.xl, borderWidth: 1, borderColor: '#BFDBFE',
    },
    linkedText: { fontSize: 13, color: '#1D4ED8', fontWeight: '600' },
    linkedSub: { fontSize: 12, color: '#3B82F6', marginTop: 2 },
  });

  const isFormComplete =
    description.trim().length > 0 &&
    location.trim().length > 0 &&
    photos.length >= 3 &&
    month.length > 0 &&
    day.length > 0 &&
    year.length > 0 &&
    hour.length > 0 &&
    minute.length > 0;

  if (submitted) return (
    <SafeAreaView style={s.safe}>
      <View style={s.success}>
        <CheckCircle size={72} color={colors.success} />
        <Text style={s.successTitle}>Report Submitted!</Text>
        <Text style={s.successSub}>
          {lost_item_id
            ? `Your found report has been sent to SDFO for review. The item owner has been notified that a match may have been found.`
            : `Your found report has been sent to SDFO for review. You'll be notified once it's approved.`}
        </Text>
        <Text style={[s.successSub, { fontSize: 13, marginTop: -8 }]}>Redirecting to your activity...</Text>
        <TouchableOpacity style={s.successBtn} onPress={() => router.replace({ pathname: '/(student)/activity', params: { tab: 'found' } })}>
          <Text style={s.successBtnText}>Go to My Reports</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <ChevronLeft size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Submit Found Item</Text>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView style={s.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

          {lost_item_id ? (
            <View style={s.linkedBox}>
              <Text style={s.linkedText}>Reporting for a specific lost item</Text>
              {lost_item_name ? <Text style={s.linkedSub}>"{lost_item_name}"</Text> : null}
            </View>
          ) : (
            <View style={s.infoBox}>
              <Text style={s.infoText}>
                Your report will go directly to SDFO for review — it won't be shown publicly.
              </Text>
            </View>
          )}

          <View style={s.section}>
            <Text style={s.label}>Item Description <Text style={s.required}>*</Text></Text>
            <TextInput
              style={[s.input, s.textarea]}
              placeholder="Describe the item you found in detail..."
              placeholderTextColor={colors.textMuted}
              value={description}
              onChangeText={setDescription}
              multiline
            />
          </View>

          <View style={s.section}>
            <Text style={s.label}>Location Found <Text style={s.required}>*</Text></Text>
            <TextInput
              style={s.input}
              placeholder="e.g. Library 2nd Floor, Near Canteen..."
              placeholderTextColor={colors.textMuted}
              value={location}
              onChangeText={setLocation}
            />
          </View>

          <View style={s.section}>
            <Text style={s.label}>Date Found <Text style={s.required}>*</Text></Text>
            <Text style={s.sublabel}>MM / DD / YYYY</Text>
            <View style={s.dateRow}>
              <TextInput
                style={[s.dateSegment, { backgroundColor: colors.surface, borderColor: datetimeError ? colors.error : colors.border, color: colors.text }]}
                placeholder="MM" placeholderTextColor={colors.textMuted}
                value={month} keyboardType="numeric" maxLength={2}
                onChangeText={v => {
                  const clean = v.replace(/\D/g, '').slice(0, 2);
                  setMonth(clean); setDatetimeError('');
                  if (clean.length === 2) dayRef.current?.focus();
                }}
              />
              <Text style={[s.dateSep, { color: colors.textMuted }]}>/</Text>
              <TextInput
                ref={dayRef}
                style={[s.dateSegment, { backgroundColor: colors.surface, borderColor: datetimeError ? colors.error : colors.border, color: colors.text }]}
                placeholder="DD" placeholderTextColor={colors.textMuted}
                value={day} keyboardType="numeric" maxLength={2}
                onChangeText={v => {
                  const clean = v.replace(/\D/g, '').slice(0, 2);
                  setDay(clean); setDatetimeError('');
                  if (clean.length === 2) yearRef.current?.focus();
                }}
              />
              <Text style={[s.dateSep, { color: colors.textMuted }]}>/</Text>
              <TextInput
                ref={yearRef}
                style={[s.yearSegment, { backgroundColor: colors.surface, borderColor: datetimeError ? colors.error : colors.border, color: colors.text }]}
                placeholder="YYYY" placeholderTextColor={colors.textMuted}
                value={year} keyboardType="numeric" maxLength={4}
                onChangeText={v => { setYear(v.replace(/\D/g, '').slice(0, 4)); setDatetimeError(''); }}
              />
            </View>
          </View>

          <View style={s.section}>
            <Text style={s.label}>Time Found <Text style={s.required}>*</Text></Text>
            <Text style={s.sublabel}>HH : MM</Text>
            <View style={s.timeRow}>
              <TextInput
                style={[s.timeSegment, { backgroundColor: colors.surface, borderColor: datetimeError ? colors.error : colors.border, color: colors.text }]}
                placeholder="HH" placeholderTextColor={colors.textMuted}
                value={hour} keyboardType="numeric" maxLength={2}
                onChangeText={v => {
                  const clean = v.replace(/\D/g, '').slice(0, 2);
                  setHour(clean); setDatetimeError('');
                  if (clean.length === 2) minuteRef.current?.focus();
                }}
              />
              <Text style={[s.dateSep, { color: colors.textMuted }]}>:</Text>
              <TextInput
                ref={minuteRef}
                style={[s.timeSegment, { backgroundColor: colors.surface, borderColor: datetimeError ? colors.error : colors.border, color: colors.text }]}
                placeholder="MM" placeholderTextColor={colors.textMuted}
                value={minute} keyboardType="numeric" maxLength={2}
                onChangeText={v => { setMinute(v.replace(/\D/g, '').slice(0, 2)); setDatetimeError(''); }}
              />
              <TouchableOpacity
                style={[s.ampmBtn, { backgroundColor: colors.surface, borderColor: datetimeError ? colors.error : colors.border }]}
                onPress={() => setShowAmPmDropdown(true)}
              >
                <Text style={[s.ampmText, { color: colors.text }]}>{ampm}</Text>
                <ChevronDown size={14} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
            {datetimeError
              ? <Text style={[s.errorText, { color: colors.error }]}>{datetimeError}</Text>
              : <Text style={[s.hint, { color: colors.textMuted }]}>Must be within the last year and not in the future.</Text>
            }
          </View>

          <View style={s.section}>
            <Text style={s.label}>Item Possession <Text style={s.required}>*</Text></Text>
            <View style={s.toggleRow}>
              <TouchableOpacity
                style={[s.toggleBtn, {
                  backgroundColor: possession === 'with_student' ? colors.primaryMuted : colors.surface,
                  borderColor: possession === 'with_student' ? colors.primary : colors.border,
                }]}
                onPress={() => setPossession('with_student')}
              >
                <Text style={[s.toggleBtnText, { color: possession === 'with_student' ? colors.primary : colors.textSecondary }]}>
                  I still have the item
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.toggleBtn, {
                  backgroundColor: possession === 'submitted_to_sdfo' ? colors.primaryMuted : colors.surface,
                  borderColor: possession === 'submitted_to_sdfo' ? colors.primary : colors.border,
                }]}
                onPress={() => setPossession('submitted_to_sdfo')}
              >
                <Text style={[s.toggleBtnText, { color: possession === 'submitted_to_sdfo' ? colors.primary : colors.textSecondary }]}>
                  I submitted to SDFO
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={s.section}>
            <Text style={s.label}>Photos <Text style={s.required}>*</Text></Text>
            <View style={s.photoGrid}>
              {photos.map((uri, i) => (
                <View key={i} style={s.photoWrap}>
                  <Image source={{ uri }} style={s.photo} />
                  <TouchableOpacity
                    style={s.removePhoto}
                    onPress={() => setPhotos(p => p.filter((_, j) => j !== i))}
                  >
                    <X size={12} color="#fff" />
                  </TouchableOpacity>
                </View>
              ))}
              {photos.length < 5 && (
                <TouchableOpacity style={s.addPhoto} onPress={pickImage}>
                  <Camera size={24} color={colors.textMuted} />
                  <Text style={s.addPhotoText}>Add Photo</Text>
                </TouchableOpacity>
              )}
            </View>
            <Text style={s.photoHint}>Min 3, max 5 photos ({photos.length}/5)</Text>
          </View>

          <TouchableOpacity
            style={[s.submitBtn, (!isFormComplete || loading) && s.submitBtnDisabled]}
            onPress={handleSubmit}
            disabled={!isFormComplete || loading}
          >
            <Text style={s.submitBtnText}>{loading ? 'Submitting...' : 'Submit Found Report'}</Text>
          </TouchableOpacity>

        </ScrollView>
      </KeyboardAvoidingView>

      <LoadingModal visible={loading} message="Uploading report..." />

      <Modal visible={showAmPmDropdown} transparent animationType="fade" onRequestClose={() => setShowAmPmDropdown(false)}>
        <TouchableOpacity style={s.modalOverlay} activeOpacity={1} onPress={() => setShowAmPmDropdown(false)}>
          <View style={[s.dropdown, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {(['AM', 'PM'] as const).map(opt => (
              <TouchableOpacity
                key={opt}
                style={[s.dropdownItem, ampm === opt && { backgroundColor: colors.primary + '20' }, { borderBottomColor: colors.border }]}
                onPress={() => { setAmpm(opt); setShowAmPmDropdown(false); }}
              >
                <Text style={[s.dropdownText, { color: ampm === opt ? colors.primary : colors.text, fontWeight: ampm === opt ? '700' : '400' }]}>
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