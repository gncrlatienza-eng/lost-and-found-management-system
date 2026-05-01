import { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, KeyboardAvoidingView, Platform, Image, Alert, Modal, FlatList, Keyboard,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { ChevronLeft, Camera, X, ChevronDown } from 'lucide-react-native';
import { useTheme } from '../../lib/ThemeContext';
import { supabase } from '../../lib/supabase';
import { Spacing, Radius } from '../../constants/theme';
import LoadingModal from '../../components/LoadingModal';

const CATEGORIES = ['Bag', 'Wallet', 'Keys', 'Phone', 'ID', 'Clothing', 'Other'];

const ONE_YEAR_AGO = new Date();
ONE_YEAR_AGO.setFullYear(ONE_YEAR_AGO.getFullYear() - 1);

// Pad single digit with leading zero
const pad = (v: string) => v.replace(/\D/g, '').slice(0, 2);

export default function PostScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const isEdit = !!id;
  const scrollRef = useRef<ScrollView>(null);
  const sectionOffsets = useRef<Record<string, number>>({});
  const focusedSection = useRef<string | null>(null);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [location, setLocation] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Date fields
  const [month, setMonth] = useState('');
  const [day, setDay] = useState('');
  const [year, setYear] = useState('');

  // Time fields
  const [hour, setHour] = useState('');
  const [minute, setMinute] = useState('');
  const [ampm, setAmpm] = useState<'AM' | 'PM'>('AM');
  const [showAmPmDropdown, setShowAmPmDropdown] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  // Refs for auto-focus
  const dayRef = useRef<TextInput>(null);
  const yearRef = useRef<TextInput>(null);
  const minuteRef = useRef<TextInput>(null);

  useFocusEffect(
    useCallback(() => {
      return () => { if (!isEdit) resetForm(); };
    }, [isEdit])
  );

  useEffect(() => {
    if (!isEdit) return;
    supabase.from('lost_items').select('*').eq('id', id).single().then(({ data }) => {
      if (data) {
        setName(data.name);
        setDescription(data.description);
        setCategory(data.category);
        setLocation(data.location);
        if (data.date_time) {
          const dt = new Date(data.date_time);
          setMonth(String(dt.getMonth() + 1).padStart(2, '0'));
          setDay(String(dt.getDate()).padStart(2, '0'));
          setYear(String(dt.getFullYear()));
          const h = dt.getHours();
          setHour(String(h % 12 || 12).padStart(2, '0'));
          setMinute(String(dt.getMinutes()).padStart(2, '0'));
          setAmpm(h >= 12 ? 'PM' : 'AM');
        }
        setPhotos(data.photos || []);
      }
    });
  }, [id]);

  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardDidShow', (event) => {
      setKeyboardVisible(true);
      setKeyboardHeight(event.endCoordinates.height);

      if (focusedSection.current) {
        scrollToSection(focusedSection.current, true);
      }
    });
    const hideSub = Keyboard.addListener('keyboardDidHide', () => {
      setKeyboardVisible(false);
      setKeyboardHeight(0);
      focusedSection.current = null;
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const resetForm = () => {
    setName(''); setDescription(''); setCategory('');
    setLocation(''); setMonth(''); setDay(''); setYear('');
    setHour(''); setMinute(''); setAmpm('AM');
    setPhotos([]); setErrors({});
  };

  const clearError = (field: string) =>
    setErrors(prev => { const e = { ...prev }; delete e[field]; return e; });

  const scrollToSection = (section: string, keyboardReady = false) => {
    focusedSection.current = section;
    const topOffset = keyboardReady ? Spacing.lg : Spacing.md;
    const targetY = Math.max(0, (sectionOffsets.current[section] ?? 0) - topOffset);
    setTimeout(() => {
      scrollRef.current?.scrollTo({ y: targetY, animated: true });
    }, keyboardReady ? 60 : 180);
  };

  // Build a Date from the fields, returns null if invalid
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
    if (photos.length >= 5) return Alert.alert('Limit Reached', 'Maximum 5 photos allowed.');
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
    if (!result.canceled) { setPhotos(p => [...p, result.assets[0].uri]); clearError('photos'); }
  };

  const uploadPhotos = async (userId: string): Promise<string[]> => {
    const urls: string[] = [];
    for (const uri of photos) {
      if (uri.startsWith('http')) { urls.push(uri); continue; }
      try {
        const rawExt = uri.split('.').pop()?.toLowerCase() || 'jpeg';
        const ext = rawExt === 'jpg' ? 'jpeg' : rawExt;
        const path = `lost/${userId}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
        const base64 = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' });
        const byteChars = atob(base64);
        const byteArray = new Uint8Array(byteChars.length);
        for (let i = 0; i < byteChars.length; i++) byteArray[i] = byteChars.charCodeAt(i);
        const { error: uploadError } = await supabase.storage
          .from('lost-items').upload(path, byteArray, { contentType: `image/${ext}`, upsert: false });
        if (uploadError) { Alert.alert('Upload Failed', uploadError.message); continue; }
        const { data: urlData } = supabase.storage.from('lost-items').getPublicUrl(path);
        if (urlData?.publicUrl) urls.push(urlData.publicUrl);
      } catch (err: any) { console.error('Photo exception:', err.message); }
    }
    return urls;
  };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!name.trim()) newErrors.name = 'Item name is required.';
    if (!category) newErrors.category = 'Please select a category.';
    if (!description.trim()) newErrors.description = 'Description is required.';
    if (!location.trim()) newErrors.location = 'Location is required.';
    if (photos.length < 3) newErrors.photos = `Add at least 3 photos (${photos.length}/3 added).`;

    const d = buildDate();
    if (!month || !day || !year || !hour || !minute) {
      newErrors.datetime = 'Please fill in all date and time fields.';
    } else if (d === null) {
      newErrors.datetime = 'Invalid date or time. Must be within the last year and not in the future.';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    const parsedDate = buildDate()!;

    Alert.alert(
      isEdit ? 'Save Changes?' : 'Post Lost Item?',
      isEdit ? 'Are you sure you want to update this post?' : `Post "${name.trim()}" as a lost item?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: isEdit ? 'Save' : 'Post',
          onPress: async () => {
            setLoading(true);
            try {
              const { data: { user } } = await supabase.auth.getUser();
              if (!user) throw new Error('Not logged in');
              const uploadedPhotos = await uploadPhotos(user.id);
              if (uploadedPhotos.length === 0)
                throw new Error('No photos uploaded. Check your storage bucket policies.');
              const payload = {
                name: name.trim(), description: description.trim(),
                category, location: location.trim(),
                date_time: parsedDate.toISOString(),
                photos: uploadedPhotos,
              };
              if (isEdit) {
                const { error } = await supabase.from('lost_items').update(payload).eq('id', id);
                if (error) throw error;
              } else {
                const { error } = await supabase.from('lost_items').insert({ ...payload, user_id: user.id });
                if (error) throw error;
              }
              Alert.alert(
                'Success',
                isEdit ? 'Your post has been updated.' : 'Your lost item has been posted!',
                [{ text: 'OK', onPress: () => { if (!isEdit) resetForm(); router.back(); } }]
              );
            } catch (e: any) { Alert.alert('Error', e.message); }
            finally { setLoading(false); }
          },
        },
      ]
    );
  };

  const isFormComplete =
    name.trim().length > 0 &&
    category.length > 0 &&
    description.trim().length > 0 &&
    location.trim().length > 0 &&
    photos.length >= 3 &&
    month.length > 0 &&
    day.length > 0 &&
    year.length > 0 &&
    hour.length > 0 &&
    minute.length > 0;

  return (
    <SafeAreaView style={[s.safe, { backgroundColor: colors.background }]}>
      <View style={[s.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()}>
          <ChevronLeft size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: colors.text }]}>
          {isEdit ? 'Edit Lost Item' : 'Post Lost Item'}
        </Text>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'android' ? 20 : 0}
        style={{ flex: 1 }}
      >
        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          contentContainerStyle={[
            s.scrollContent,
              {
                paddingBottom: keyboardVisible
                  ? keyboardHeight + Math.max(insets.bottom, Spacing.sm)
                  : Math.max(insets.bottom, Spacing.md),
              },
            ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >

          {/* Item Name */}
          <View
            style={s.section}
            onLayout={(event) => {
              sectionOffsets.current.name = event.nativeEvent.layout.y;
            }}
          >
            <Text style={[s.label, { color: colors.text }]}>Item Name <Text style={{ color: colors.error }}>*</Text></Text>
            <TextInput
              style={[s.input, { backgroundColor: colors.surface, borderColor: errors.name ? colors.error : colors.border, color: colors.text }]}
              placeholder="e.g. Black Jansport Bag"
              placeholderTextColor={colors.textMuted}
              value={name}
              onChangeText={v => { setName(v); clearError('name'); }}
              onFocus={() => scrollToSection('name')}
            />
            {errors.name && <Text style={[s.errorText, { color: colors.error }]}>{errors.name}</Text>}
          </View>

          {/* Category */}
          <View style={s.section}>
            <Text style={[s.label, { color: colors.text }]}>Category <Text style={{ color: colors.error }}>*</Text></Text>
            <View style={s.chips}>
              {CATEGORIES.map(c => (
                <TouchableOpacity
                  key={c}
                  style={[s.chip, {
                    backgroundColor: category === c ? colors.primary : colors.surface,
                    borderColor: category === c ? colors.primary : errors.category ? colors.error : colors.border,
                  }]}
                  onPress={() => { setCategory(c); clearError('category'); }}
                >
                  <Text style={[s.chipText, { color: category === c ? '#fff' : colors.textSecondary }]}>{c}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {errors.category && <Text style={[s.errorText, { color: colors.error }]}>{errors.category}</Text>}
          </View>

          {/* Description */}
          <View
            style={s.section}
            onLayout={(event) => {
              sectionOffsets.current.description = event.nativeEvent.layout.y;
            }}
          >
            <Text style={[s.label, { color: colors.text }]}>Description <Text style={{ color: colors.error }}>*</Text></Text>
            <TextInput
              style={[s.input, s.textarea, { backgroundColor: colors.surface, borderColor: errors.description ? colors.error : colors.border, color: colors.text }]}
              placeholder="Describe your item — color, brand, markings..."
              placeholderTextColor={colors.textMuted}
              value={description}
              onChangeText={v => { setDescription(v); clearError('description'); }}
              multiline
              onFocus={() => scrollToSection('description')}
            />
            {errors.description && <Text style={[s.errorText, { color: colors.error }]}>{errors.description}</Text>}
          </View>

          {/* Location */}
          <View
            style={s.section}
            onLayout={(event) => {
              sectionOffsets.current.location = event.nativeEvent.layout.y;
            }}
          >
            <Text style={[s.label, { color: colors.text }]}>Location Lost <Text style={{ color: colors.error }}>*</Text></Text>
            <TextInput
              style={[s.input, { backgroundColor: colors.surface, borderColor: errors.location ? colors.error : colors.border, color: colors.text }]}
              placeholder="e.g. Library 2nd Floor, Near Canteen..."
              placeholderTextColor={colors.textMuted}
              value={location}
              onChangeText={v => { setLocation(v); clearError('location'); }}
              onFocus={() => scrollToSection('location')}
            />
            {errors.location && <Text style={[s.errorText, { color: colors.error }]}>{errors.location}</Text>}
          </View>

          {/* Date */}
          <View
            style={s.section}
            onLayout={(event) => {
              sectionOffsets.current.date = event.nativeEvent.layout.y;
            }}
          >
            <Text style={[s.label, { color: colors.text }]}>Date Lost <Text style={{ color: colors.error }}>*</Text></Text>
            <Text style={[s.sublabel, { color: colors.textMuted }]}>MM / DD / YYYY</Text>
            <View style={s.dateRow}>
              {/* Month */}
              <TextInput
                style={[s.dateSegment, { backgroundColor: colors.surface, borderColor: errors.datetime ? colors.error : colors.border, color: colors.text }]}
                placeholder="MM"
                placeholderTextColor={colors.textMuted}
                value={month}
                keyboardType="numeric"
                maxLength={2}
                onChangeText={v => {
                  const clean = v.replace(/\D/g, '').slice(0, 2);
                  setMonth(clean);
                  clearError('datetime');
                  if (clean.length === 2) dayRef.current?.focus();
                }}
                onFocus={() => scrollToSection('date')}
              />
              <Text style={[s.dateSep, { color: colors.textMuted }]}>/</Text>
              {/* Day */}
              <TextInput
                ref={dayRef}
                style={[s.dateSegment, { backgroundColor: colors.surface, borderColor: errors.datetime ? colors.error : colors.border, color: colors.text }]}
                placeholder="DD"
                placeholderTextColor={colors.textMuted}
                value={day}
                keyboardType="numeric"
                maxLength={2}
                onChangeText={v => {
                  const clean = v.replace(/\D/g, '').slice(0, 2);
                  setDay(clean);
                  clearError('datetime');
                  if (clean.length === 2) yearRef.current?.focus();
                }}
                onFocus={() => scrollToSection('date')}
              />
              <Text style={[s.dateSep, { color: colors.textMuted }]}>/</Text>
              {/* Year */}
              <TextInput
                ref={yearRef}
                style={[s.yearSegment, { backgroundColor: colors.surface, borderColor: errors.datetime ? colors.error : colors.border, color: colors.text }]}
                placeholder="YYYY"
                placeholderTextColor={colors.textMuted}
                value={year}
                keyboardType="numeric"
                maxLength={4}
                onChangeText={v => {
                  const clean = v.replace(/\D/g, '').slice(0, 4);
                  setYear(clean);
                  clearError('datetime');
                }}
                onFocus={() => scrollToSection('date')}
              />
            </View>
          </View>

          {/* Time */}
          <View
            style={s.section}
            onLayout={(event) => {
              sectionOffsets.current.time = event.nativeEvent.layout.y;
            }}
          >
            <Text style={[s.label, { color: colors.text }]}>Time Lost <Text style={{ color: colors.error }}>*</Text></Text>
            <Text style={[s.sublabel, { color: colors.textMuted }]}>HH : MM</Text>
            <View style={s.timeRow}>
              {/* Hour */}
              <TextInput
                style={[s.timeSegment, { backgroundColor: colors.surface, borderColor: errors.datetime ? colors.error : colors.border, color: colors.text }]}
                placeholder="HH"
                placeholderTextColor={colors.textMuted}
                value={hour}
                keyboardType="numeric"
                maxLength={2}
                onChangeText={v => {
                  const clean = v.replace(/\D/g, '').slice(0, 2);
                  setHour(clean);
                  clearError('datetime');
                  if (clean.length === 2) minuteRef.current?.focus();
                }}
                onFocus={() => scrollToSection('time')}
              />
              <Text style={[s.dateSep, { color: colors.textMuted }]}>:</Text>
              {/* Minute */}
              <TextInput
                ref={minuteRef}
                style={[s.timeSegment, { backgroundColor: colors.surface, borderColor: errors.datetime ? colors.error : colors.border, color: colors.text }]}
                placeholder="MM"
                placeholderTextColor={colors.textMuted}
                value={minute}
                keyboardType="numeric"
                maxLength={2}
                onChangeText={v => {
                  const clean = v.replace(/\D/g, '').slice(0, 2);
                  setMinute(clean);
                  clearError('datetime');
                }}
                onFocus={() => scrollToSection('time')}
              />
              {/* AM/PM Dropdown */}
              <TouchableOpacity
                style={[s.ampmBtn, { backgroundColor: colors.surface, borderColor: errors.datetime ? colors.error : colors.border }]}
                onPress={() => setShowAmPmDropdown(true)}
              >
                <Text style={[s.ampmText, { color: colors.text }]}>{ampm}</Text>
                <ChevronDown size={14} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
            {errors.datetime && <Text style={[s.errorText, { color: colors.error }]}>{errors.datetime}</Text>}
            <Text style={[s.hint, { color: colors.textMuted }]}>Must be within the last year and not in the future.</Text>
          </View>

          {/* Photos */}
          <View style={s.section}>
            <Text style={[s.label, { color: colors.text }]}>Photos <Text style={{ color: colors.error }}>*</Text></Text>
            <View style={s.photoGrid}>
              {photos.map((uri, i) => (
                <View key={i} style={s.photoWrap}>
                  <Image source={{ uri }} style={s.photo} />
                  <TouchableOpacity
                    style={[s.removePhoto, { backgroundColor: colors.error }]}
                    onPress={() => setPhotos(p => p.filter((_, j) => j !== i))}
                  >
                    <X size={12} color="#fff" />
                  </TouchableOpacity>
                </View>
              ))}
              {photos.length < 5 && (
                <TouchableOpacity
                  style={[s.addPhoto, { borderColor: errors.photos ? colors.error : colors.border }]}
                  onPress={pickImage}
                >
                  <Camera size={24} color={colors.textMuted} />
                  <Text style={[s.addPhotoText, { color: colors.textSecondary }]}>Add Photo</Text>
                </TouchableOpacity>
              )}
            </View>
            {errors.photos
              ? <Text style={[s.errorText, { color: colors.error }]}>{errors.photos}</Text>
              : <Text style={[s.hint, { color: colors.textMuted }]}>Min 3, max 5 photos ({photos.length}/5)</Text>
            }
          </View>

          {/* Submit */}
          <TouchableOpacity
            style={[s.submitBtn, { backgroundColor: colors.primary }, (!isFormComplete || loading) && s.submitBtnDisabled]}
            onPress={handleSubmit}
            disabled={!isFormComplete || loading}
          >
            <Text style={s.submitBtnText}>
              {loading ? 'Uploading...' : isEdit ? 'Save Changes' : 'Post Lost Item'}
            </Text>
          </TouchableOpacity>

        </ScrollView>
      </KeyboardAvoidingView>

      <LoadingModal visible={loading} message="Uploading photos..." />

      {/* AM/PM Modal */}
      <Modal
        visible={showAmPmDropdown}
        transparent
        animationType="fade"
        onRequestClose={() => setShowAmPmDropdown(false)}
      >
        <TouchableOpacity
          style={s.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowAmPmDropdown(false)}
        >
          <View style={[s.dropdown, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {(['AM', 'PM'] as const).map(opt => (
              <TouchableOpacity
                key={opt}
                style={[
                  s.dropdownItem,
                  ampm === opt && { backgroundColor: colors.primary + '20' },
                  { borderBottomColor: colors.border },
                ]}
                onPress={() => { setAmpm(opt); setShowAmPmDropdown(false); }}
              >
                <Text style={[s.dropdownText, { color: ampm === opt ? colors.primary : colors.text, fontWeight: ampm === opt ? '700' : '400' }]}>{opt}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.xl, paddingVertical: Spacing.lg,
    borderBottomWidth: 1, gap: Spacing.md,
  },
  headerTitle: { fontSize: 18, fontWeight: '700' },
  scrollContent: { padding: Spacing.xl },
  section: { marginBottom: Spacing.xl },
  label: { fontSize: 13, fontWeight: '600', marginBottom: 2 },
  sublabel: { fontSize: 11, marginBottom: Spacing.sm },
  input: {
    borderRadius: Radius.md, paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md, fontSize: 15, borderWidth: 1,
  },
  textarea: { height: 100, textAlignVertical: 'top' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  chip: {
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    borderRadius: Radius.full, borderWidth: 1,
  },
  chipText: { fontSize: 13, fontWeight: '600' },
  // Date
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
  // Time
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  timeSegment: {
    width: 52, borderRadius: Radius.md, borderWidth: 1,
    paddingHorizontal: 8, paddingVertical: Spacing.md,
    fontSize: 16, textAlign: 'center', fontWeight: '600',
  },
  ampmBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderRadius: Radius.md, borderWidth: 1,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.md,
    minWidth: 70,
  },
  ampmText: { fontSize: 15, fontWeight: '600' },
  // Photos
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  photoWrap: { position: 'relative', width: 90, height: 90 },
  photo: { width: 90, height: 90, borderRadius: Radius.sm },
  removePhoto: {
    position: 'absolute', top: -6, right: -6,
    borderRadius: 10, width: 20, height: 20,
    alignItems: 'center', justifyContent: 'center',
  },
  addPhoto: {
    width: 90, height: 90, borderRadius: Radius.sm,
    borderWidth: 2, borderStyle: 'dashed',
    alignItems: 'center', justifyContent: 'center', gap: 4,
  },
  addPhotoText: { fontSize: 11 },
  errorText: { fontSize: 12, marginTop: 4, fontWeight: '500' },
  hint: { fontSize: 12, marginTop: 4 },
  submitBtn: {
    borderRadius: Radius.md, paddingVertical: 16,
    alignItems: 'center',
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  // AM/PM dropdown
  modalOverlay: {
    flex: 1, justifyContent: 'center', alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  dropdown: {
    borderRadius: Radius.md, borderWidth: 1,
    overflow: 'hidden', minWidth: 120,
  },
  dropdownItem: {
    paddingVertical: 14, paddingHorizontal: Spacing.xl,
    borderBottomWidth: 1,
  },
  dropdownText: { fontSize: 16, textAlign: 'center' },
});
