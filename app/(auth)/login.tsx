import { useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform, ScrollView, Alert, Keyboard, Dimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Colors, Spacing, Radius } from '../../constants/theme';
import { supabase } from '../../lib/supabase';
import { useTheme } from '../../lib/ThemeContext';
import { getResetPasswordRedirectUrl } from '../../lib/authRedirect';

export default function LoginScreen() {
  const { colors, isDark, toggle } = useTheme();
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sendingReset, setSendingReset] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [resetNotice, setResetNotice] = useState('');
  const [scrollEnabled, setScrollEnabled] = useState(false);
  const [containerHeight, setContainerHeight] = useState(0);
  const [contentHeight, setContentHeight] = useState(0);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const scrollOffset = useRef(0);
  const fieldRefs = useRef<Record<string, View | null>>({});
  const focusedField = useRef<string | null>(null);

  useEffect(() => {
    setScrollEnabled(keyboardVisible || contentHeight > containerHeight + 12);
  }, [containerHeight, contentHeight, keyboardVisible]);

  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardDidShow', (event) => {
      const nextKeyboardHeight = event.endCoordinates.height;
      setKeyboardVisible(true);
      setKeyboardHeight(nextKeyboardHeight);

      if (focusedField.current) {
        scrollToField(focusedField.current, nextKeyboardHeight);
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

  const scrollToField = (field: string, keyboardHeightOverride?: number) => {
    focusedField.current = field;
    const activeKeyboardHeight = keyboardHeightOverride ?? keyboardHeight;
    if (activeKeyboardHeight <= 0) return;

    const fieldRef = fieldRefs.current[field];
    if (!fieldRef) return;

    setTimeout(() => {
      fieldRef.measureInWindow((_x, y, _width, height) => {
        const keyboardTop = Dimensions.get('window').height - activeKeyboardHeight;
        const topLimit = insets.top + Spacing.sm;
        const bottomLimit = keyboardTop - Spacing.sm;
        const fieldBottom = y + height;
        let targetY = scrollOffset.current;

        if (fieldBottom > bottomLimit) {
          targetY += fieldBottom - bottomLimit;
        } else if (y < topLimit) {
          targetY = Math.max(0, targetY - (topLimit - y));
        }

        if (Math.abs(targetY - scrollOffset.current) > 1) {
          scrollRef.current?.scrollTo({ y: targetY, animated: true });
        }
      });
    }, keyboardHeightOverride ? 60 : 0);
  };

  const clearError = (field: string) => {
    setErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  };

  const validateLogin = () => {
    const trimmedEmail = email.trim().toLowerCase();
    const nextErrors: Record<string, string> = {};

    if (!trimmedEmail) nextErrors.email = 'Enter your DLSL school email.';
    else if (!trimmedEmail.endsWith('@dlsl.edu.ph')) nextErrors.email = 'Use your @dlsl.edu.ph email.';

    if (!password.trim()) nextErrors.password = 'Enter your password.';

    setErrors(nextErrors);
    return {
      isValid: Object.keys(nextErrors).length === 0,
      trimmedEmail,
    };
  };

  const handleLogin = async () => {
    const { isValid, trimmedEmail } = validateLogin();
    setResetNotice('');
    if (!isValid) return;

    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: trimmedEmail,
        password,
      });
      if (error) throw error;
    } catch (error: any) {
      Alert.alert('Sign In Failed', error?.message ?? 'Unable to sign in right now.');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    const trimmedEmail = email.trim().toLowerCase();

    if (!trimmedEmail) {
      setErrors((current) => ({
        ...current,
        email: 'Enter your DLSL email first so we know where to send the reset link.',
      }));
      return;
    }

    if (!trimmedEmail.endsWith('@dlsl.edu.ph')) {
      setErrors((current) => ({
        ...current,
        email: 'Use your @dlsl.edu.ph email for password recovery.',
      }));
      return;
    }

    setSendingReset(true);
    setResetNotice('');
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(trimmedEmail, {
        redirectTo: getResetPasswordRedirectUrl(),
      });
      if (error) throw error;

      setResetNotice('Reset instructions were sent to your school email.');
    } catch (error: any) {
      Alert.alert('Reset Failed', error?.message ?? 'Unable to send a reset email right now.');
    } finally {
      setSendingReset(false);
    }
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: isDark ? '#0F0F1A' : Colors.white }]}>
      <LinearGradient
        colors={isDark ? ['#0F0F1A', '#0F0F1A'] : ['#FFFFFF', '#F0FAF6']}
        style={StyleSheet.absoluteFill}
      />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'android' ? 24 : 0}
        style={styles.flex}
      >
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={[
            styles.scroll,
            keyboardVisible && styles.scrollKeyboard,
            {
              paddingBottom: keyboardVisible
                ? keyboardHeight + Spacing.xl
                : Spacing.xxxl + Math.max(insets.bottom, Spacing.md),
            },
          ]}
          onLayout={(event) => setContainerHeight(event.nativeEvent.layout.height)}
          onContentSizeChange={(_, height) => setContentHeight(height)}
          onScroll={(event) => { scrollOffset.current = event.nativeEvent.contentOffset.y; }}
          keyboardShouldPersistTaps="handled"
          scrollEnabled={scrollEnabled}
          showsVerticalScrollIndicator={false}
          bounces={false}
          scrollEventThrottle={16}
        >
          <View style={styles.content}>
            <View style={styles.header}>
              <View style={styles.logoBox}>
                <Text style={styles.logoText}>L</Text>
              </View>
              <Text style={styles.appName}>LAFMS</Text>
              <Text style={styles.tagline}>Lost and Found · De La Salle Lipa</Text>
            </View>

            <View style={[styles.card, { backgroundColor: colors.surface }]}>
              <Text style={[styles.cardTitle, { color: colors.text }]}>Welcome back</Text>
              <Text style={[styles.cardSub, { color: colors.textSecondary }]}>Sign in with your DLSL email</Text>

              <View
                style={styles.fieldGroup}
                ref={(ref) => { fieldRefs.current.email = ref; }}
                collapsable={false}
              >
                <Text style={[styles.label, { color: colors.gray700 }]}>School Email</Text>
                <View style={[
                  styles.inputRow,
                  {
                    backgroundColor: colors.gray100,
                    borderColor: errors.email ? colors.error : colors.border,
                  },
                ]}>
                  <TextInput
                    style={[styles.input, { color: colors.text }]}
                    placeholder="you@dlsl.edu.ph"
                    placeholderTextColor={colors.textMuted}
                    value={email}
                    onChangeText={(value) => {
                      setEmail(value);
                      clearError('email');
                      setResetNotice('');
                    }}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoComplete="email"
                    autoCorrect={false}
                    selectionColor={colors.primary}
                    cursorColor={colors.primary}
                    onFocus={() => scrollToField('email')}
                  />
                </View>
                {errors.email ? <Text style={[styles.errorText, { color: colors.error }]}>{errors.email}</Text> : null}
              </View>

              <View
                style={styles.fieldGroup}
                ref={(ref) => { fieldRefs.current.password = ref; }}
                collapsable={false}
              >
                <Text style={[styles.label, { color: colors.gray700 }]}>Password</Text>
                <View style={[
                  styles.inputRow,
                  {
                    backgroundColor: colors.gray100,
                    borderColor: errors.password ? colors.error : colors.border,
                  },
                ]}>
                  <TextInput
                    style={[styles.input, { color: colors.text }]}
                    placeholder="Enter your password"
                    placeholderTextColor={colors.textMuted}
                    value={password}
                    onChangeText={(value) => {
                      setPassword(value);
                      clearError('password');
                    }}
                    secureTextEntry={!showPassword}
                    autoComplete="password"
                    autoCapitalize="none"
                    autoCorrect={false}
                    selectionColor={colors.primary}
                    cursorColor={colors.primary}
                    onFocus={() => scrollToField('password')}
                  />
                  <TouchableOpacity onPress={() => setShowPassword((current) => !current)}>
                    <Text style={styles.showText}>{showPassword ? 'Hide' : 'Show'}</Text>
                  </TouchableOpacity>
                </View>
                {errors.password ? <Text style={[styles.errorText, { color: colors.error }]}>{errors.password}</Text> : null}
              </View>

              <TouchableOpacity style={styles.forgotRow} onPress={handleForgotPassword} disabled={sendingReset}>
                <Text style={styles.forgotText}>{sendingReset ? 'Sending reset link...' : 'Forgot password?'}</Text>
              </TouchableOpacity>
              {resetNotice ? <Text style={[styles.successText, { color: colors.primary }]}>{resetNotice}</Text> : null}

              <TouchableOpacity
                style={[styles.loginBtn, loading && styles.loginBtnDisabled]}
                onPress={handleLogin}
                disabled={loading}
                activeOpacity={0.9}
              >
                <Text style={styles.loginBtnText}>
                  {loading ? 'Signing in...' : 'Sign In'}
                </Text>
              </TouchableOpacity>
            </View>

            <View style={styles.registerRow}>
              <Text style={styles.registerText}>Don't have an account? </Text>
              <TouchableOpacity onPress={() => router.push('/(auth)/register')}>
                <Text style={styles.registerLink}>Register</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity onPress={toggle} style={styles.themeToggle}>
              <Text style={styles.themeToggleText}>
                {isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.white },
  flex: { flex: 1 },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.xxxl,
    justifyContent: 'center',
  },
  scrollKeyboard: {
    justifyContent: 'flex-start',
    paddingTop: Spacing.xl,
  },
  content: {
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: Spacing.xxxl,
    marginTop: Spacing.giant,
  },
  logoBox: {
    width: 64,
    height: 64,
    borderRadius: Radius.lg,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  appName: {
    fontSize: 34,
    fontWeight: '900',
    color: Colors.primary,
    letterSpacing: -0.5,
  },
  tagline: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 4,
    letterSpacing: 0.2,
  },
  card: {
    backgroundColor: Colors.white,
    borderRadius: Radius.xl,
    padding: Spacing.xxl,
    shadowColor: Colors.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 16,
    elevation: 4,
  },
  cardTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 4,
  },
  cardSub: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginBottom: Spacing.xxl,
  },
  fieldGroup: { marginBottom: Spacing.lg },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.gray700,
    marginBottom: 6,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.gray100,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    gap: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: Colors.text,
  },
  errorText: { fontSize: 12, marginTop: 4, fontWeight: '500' },
  forgotRow: { alignItems: 'flex-end', marginBottom: Spacing.sm, marginTop: -4 },
  forgotText: { fontSize: 13, color: Colors.primary, fontWeight: '500' },
  successText: { fontSize: 12, marginBottom: Spacing.lg, fontWeight: '600' },
  loginBtn: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.md,
    paddingVertical: 16,
    alignItems: 'center',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 4,
  },
  loginBtnDisabled: { opacity: 0.7 },
  loginBtnText: { color: Colors.white, fontSize: 16, fontWeight: '700', letterSpacing: 0.3 },
  showText: { color: Colors.primary, fontWeight: '600', fontSize: 13 },
  logoText: { color: Colors.white, fontSize: 28, fontWeight: '900' },
  registerRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: Spacing.xl,
  },
  registerText: { fontSize: 14, color: Colors.textSecondary },
  registerLink: { fontSize: 14, color: Colors.primary, fontWeight: '700' },
  themeToggle: { alignItems: 'center', marginTop: Spacing.lg, paddingVertical: Spacing.sm },
  themeToggleText: { fontSize: 13, color: Colors.primary, fontWeight: '500' },
});
