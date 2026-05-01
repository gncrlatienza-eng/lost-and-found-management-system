import { useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform, ScrollView, Keyboard,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Mail, Lock, User, Phone, Hash, ChevronLeft, AlertCircle } from 'lucide-react-native';
import { Colors, Spacing, Radius } from '../../constants/theme';
import { supabase } from '../../lib/supabase';
import { useTheme } from '../../lib/ThemeContext';

interface Field {
  label: string;
  placeholder: string;
  key: string;
  icon: any;
  keyboard?: any;
  secure?: boolean;
}

const FIELDS: Field[] = [
  { label: 'Student ID', placeholder: '22-12345', key: 'student_id', icon: Hash },
  { label: 'Full Name', placeholder: 'Juan Dela Cruz', key: 'name', icon: User },
  { label: 'School Email', placeholder: 'you@dlsl.edu.ph', key: 'email', icon: Mail, keyboard: 'email-address' },
  { label: 'Contact Number', placeholder: '09XX XXX XXXX', key: 'contact', icon: Phone, keyboard: 'phone-pad' },
  { label: 'Password', placeholder: 'Enter your password', key: 'password', icon: Lock, secure: true },
];

const VALIDATORS: Record<string, (v: string) => string | null> = {
  student_id: (v) => /^\d+$/.test(v.trim()) ? null : 'Student ID must be numbers only',
  name: (v) => v.trim().length >= 2 ? null : 'Enter your full name',
  email: (v) => v.trim().toLowerCase().endsWith('@dlsl.edu.ph') ? null : 'Must be a @dlsl.edu.ph email',
  contact: (v) => /^09\d{9}$/.test(v.replace(/\s/g, '')) ? null : 'Must be 09XXXXXXXXX (11 digits)',
  password: (v) => v.length >= 8 ? null : 'Password must be at least 8 characters',
};

export default function RegisterScreen() {
  const { isDark, toggle } = useTheme();
  const insets = useSafeAreaInsets();
  const [form, setForm] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const fieldOffsets = useRef<Record<string, number>>({});
  const cardOffset = useRef(0);
  const focusedField = useRef<string | null>(null);

  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardDidShow', (event) => {
      setKeyboardVisible(true);
      setKeyboardHeight(event.endCoordinates.height);

      if (focusedField.current) {
        scrollToField(focusedField.current, true);
      }
    });
    const hideSub = Keyboard.addListener('keyboardDidHide', () => {
      setKeyboardVisible(false);
      setKeyboardHeight(0);
      focusedField.current = null;
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const validateField = (key: string, value: string) => {
    const error = VALIDATORS[key]?.(value) ?? null;
    setErrors((current) => ({ ...current, [key]: error ?? '' }));
    return error;
  };

  const scrollToField = (key: string, keyboardReady = false) => {
    focusedField.current = key;
    const topOffset = keyboardReady ? Spacing.lg : Spacing.md;
    const targetY = Math.max(0, cardOffset.current + (fieldOffsets.current[key] ?? 0) - topOffset);
    setTimeout(() => {
      scrollRef.current?.scrollTo({ y: targetY, animated: true });
    }, keyboardReady ? 60 : 180);
  };

  const handleRegister = async () => {
    const newErrors: Record<string, string> = {};
    let hasError = false;

    for (const field of FIELDS) {
      const value = form[field.key] || '';
      if (!value) {
        newErrors[field.key] = 'This field is required';
        hasError = true;
      } else {
        const error = VALIDATORS[field.key]?.(value);
        if (error) {
          newErrors[field.key] = error;
          hasError = true;
        }
      }
    }

    setErrors(newErrors);
    if (hasError) return;

    const { student_id, name, email, contact, password } = form;
    setLoading(true);
    try {
      const { error } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password,
        options: { data: { student_id, name, contact, role: 'student' } },
      });
      if (error) throw error;
      alert('Account created! Please check your email to verify.');
      router.replace('/(auth)/login');
    } catch (err: any) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: isDark ? '#0F0F1A' : Colors.white }]}>
      <LinearGradient colors={isDark ? ['#0F0F1A', '#0F0F1A'] : ['#FFFFFF', '#F0FAF6']} style={StyleSheet.absoluteFill} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'android' ? 24 : 0}
        style={styles.flex}
      >
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={[
            styles.scroll,
            {
              paddingBottom: keyboardVisible
                ? keyboardHeight + Spacing.xl
                : Spacing.giant + Math.max(insets.bottom, Spacing.lg),
            },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <TouchableOpacity style={styles.back} onPress={() => router.back()}>
            <ChevronLeft size={22} color={Colors.primary} />
            <Text style={styles.backText}>Back</Text>
          </TouchableOpacity>

          <Text style={styles.title}>Create Account</Text>
          <Text style={styles.subtitle}>Join LAFMS with your DLSL credentials</Text>

          <View
            style={styles.card}
            onLayout={(event) => {
              cardOffset.current = event.nativeEvent.layout.y;
            }}
          >
            {FIELDS.map(({ label, placeholder, key, icon: Icon, keyboard, secure }) => (
              <View
                key={key}
                style={styles.fieldGroup}
                onLayout={(event) => {
                  fieldOffsets.current[key] = event.nativeEvent.layout.y;
                }}
              >
                <Text style={styles.label}>{label}</Text>
                <View style={[
                  styles.inputRow,
                  errors[key] ? styles.inputError : null,
                ]}>
                  <Icon size={18} color={errors[key] ? Colors.error : Colors.gray400} />
                  <TextInput
                    style={styles.input}
                    placeholder={placeholder}
                    placeholderTextColor={Colors.textMuted}
                    value={form[key] || ''}
                    onChangeText={(value) => {
                      setForm((current) => ({ ...current, [key]: value }));
                      if (errors[key]) validateField(key, value);
                    }}
                    onBlur={() => validateField(key, form[key] || '')}
                    onFocus={() => scrollToField(key)}
                    keyboardType={keyboard || 'default'}
                    secureTextEntry={secure}
                    autoCapitalize={key === 'email' || key === 'password' ? 'none' : 'words'}
                    autoCorrect={false}
                  />
                </View>
                {errors[key] ? (
                  <View style={styles.errorRow}>
                    <AlertCircle size={12} color={Colors.error} />
                    <Text style={styles.errorText}>{errors[key]}</Text>
                  </View>
                ) : null}
              </View>
            ))}

            <TouchableOpacity
              style={[styles.btn, loading && styles.btnDisabled]}
              onPress={handleRegister}
              disabled={loading}
              activeOpacity={0.9}
            >
              <Text style={styles.btnText}>{loading ? 'Creating account...' : 'Create Account'}</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.loginRow}>
            <Text style={styles.loginText}>Already have an account? </Text>
            <TouchableOpacity onPress={() => router.back()}>
              <Text style={styles.loginLink}>Sign In</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity onPress={toggle} style={styles.themeToggle}>
            <Text style={styles.themeToggleText}>
              {isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.white },
  flex: { flex: 1 },
  scroll: { flexGrow: 1, paddingHorizontal: Spacing.xl },
  back: { flexDirection: 'row', alignItems: 'center', marginTop: Spacing.lg, marginBottom: Spacing.xxl, gap: 4 },
  backText: { color: Colors.primary, fontSize: 15, fontWeight: '500' },
  title: { fontSize: 28, fontWeight: '800', color: Colors.text, marginBottom: 4 },
  subtitle: { fontSize: 14, color: Colors.textSecondary, marginBottom: Spacing.xxl },
  card: {
    backgroundColor: Colors.white, borderRadius: Radius.xl, padding: Spacing.xxl,
    shadowColor: Colors.shadow, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1, shadowRadius: 16, elevation: 4,
  },
  fieldGroup: { marginBottom: Spacing.lg },
  label: { fontSize: 13, fontWeight: '600', color: Colors.gray700, marginBottom: 6 },
  inputRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.gray100, borderRadius: Radius.md,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.md,
    gap: Spacing.sm, borderWidth: 1, borderColor: Colors.border,
  },
  inputError: { borderColor: Colors.error, backgroundColor: '#FFF5F5' },
  input: { flex: 1, fontSize: 15, color: Colors.text },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  errorText: { fontSize: 12, color: Colors.error },
  btn: {
    backgroundColor: Colors.primary, borderRadius: Radius.md,
    paddingVertical: 16, alignItems: 'center', marginTop: Spacing.sm,
    shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35, shadowRadius: 8, elevation: 4,
  },
  btnDisabled: { opacity: 0.7 },
  btnText: { color: Colors.white, fontSize: 16, fontWeight: '700', letterSpacing: 0.3 },
  loginRow: { flexDirection: 'row', justifyContent: 'center', marginTop: Spacing.xl },
  loginText: { fontSize: 14, color: Colors.textSecondary },
  loginLink: { fontSize: 14, color: Colors.primary, fontWeight: '700' },
  themeToggle: { alignItems: 'center', marginTop: Spacing.lg, paddingVertical: Spacing.sm },
  themeToggleText: { fontSize: 13, color: Colors.primary, fontWeight: '500' },
});
