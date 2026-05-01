import { useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform, Alert, ScrollView, Keyboard, Dimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Colors, Spacing, Radius } from '../../constants/theme';
import { supabase } from '../../lib/supabase';
import { useTheme } from '../../lib/ThemeContext';

export default function ResetPasswordScreen() {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const scrollOffset = useRef(0);
  const fieldRefs = useRef<Record<string, View | null>>({});
  const focusedField = useRef<string | null>(null);

  const canSubmit = useMemo(() => {
    return password.trim().length >= 8 && confirmPassword.trim().length >= 8;
  }, [confirmPassword, password]);

  const clearError = (field: string) => {
    setErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  };

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

  const handleResetPassword = async () => {
    const nextErrors: Record<string, string> = {};

    if (!password.trim()) nextErrors.password = 'Enter a new password.';
    else if (password.trim().length < 8) nextErrors.password = 'Password must be at least 8 characters.';

    if (!confirmPassword.trim()) nextErrors.confirmPassword = 'Confirm your new password.';
    else if (password !== confirmPassword) nextErrors.confirmPassword = 'Passwords do not match.';

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: password.trim() });
      if (error) throw error;

      await supabase.auth.signOut();
      Alert.alert('Password Updated', 'Your password has been updated. Please sign in again.');
      router.replace('/(auth)/login');
    } catch (error: any) {
      Alert.alert('Unable to Reset Password', error?.message ?? 'Something went wrong. Please request a new reset link.');
    } finally {
      setLoading(false);
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
            styles.content,
            keyboardVisible && styles.contentKeyboard,
            {
              paddingBottom: keyboardVisible
                ? keyboardHeight + Spacing.xl
                : Spacing.xl + Math.max(insets.bottom, Spacing.md),
            },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          onScroll={(event) => { scrollOffset.current = event.nativeEvent.contentOffset.y; }}
          scrollEventThrottle={16}
        >
          <View style={styles.header}>
            <View style={styles.logoBox}>
              <Text style={styles.logoText}>L</Text>
            </View>
            <Text style={styles.appName}>Set a New Password</Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              Choose a new password for your LAFMS account.
            </Text>
          </View>

          <View style={[styles.card, { backgroundColor: colors.surface }]}>
            <View
              style={styles.fieldGroup}
              ref={(ref) => { fieldRefs.current.password = ref; }}
              collapsable={false}
            >
              <Text style={[styles.label, { color: colors.gray700 }]}>New Password</Text>
              <View style={[
                styles.inputRow,
                {
                  backgroundColor: colors.gray100,
                  borderColor: errors.password ? colors.error : colors.border,
                },
              ]}>
                <TextInput
                  style={[styles.input, { color: colors.text }]}
                  placeholder="Enter your new password"
                  placeholderTextColor={colors.textMuted}
                  value={password}
                  onChangeText={(value) => { setPassword(value); clearError('password'); }}
                  secureTextEntry={!showPassword}
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

            <View
              style={styles.fieldGroup}
              ref={(ref) => { fieldRefs.current.confirmPassword = ref; }}
              collapsable={false}
            >
              <Text style={[styles.label, { color: colors.gray700 }]}>Confirm Password</Text>
              <View style={[
                styles.inputRow,
                {
                  backgroundColor: colors.gray100,
                  borderColor: errors.confirmPassword ? colors.error : colors.border,
                },
              ]}>
                <TextInput
                  style={[styles.input, { color: colors.text }]}
                  placeholder="Re-enter your new password"
                  placeholderTextColor={colors.textMuted}
                  value={confirmPassword}
                  onChangeText={(value) => { setConfirmPassword(value); clearError('confirmPassword'); }}
                  secureTextEntry={!showConfirmPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                  selectionColor={colors.primary}
                  cursorColor={colors.primary}
                  onFocus={() => scrollToField('confirmPassword')}
                />
                <TouchableOpacity onPress={() => setShowConfirmPassword((current) => !current)}>
                  <Text style={styles.showText}>{showConfirmPassword ? 'Hide' : 'Show'}</Text>
                </TouchableOpacity>
              </View>
              {errors.confirmPassword ? (
                <Text style={[styles.errorText, { color: colors.error }]}>{errors.confirmPassword}</Text>
              ) : null}
            </View>

            <TouchableOpacity
              style={[styles.button, (!canSubmit || loading) && styles.buttonDisabled]}
              onPress={handleResetPassword}
              disabled={!canSubmit || loading}
              activeOpacity={0.9}
            >
              <Text style={styles.buttonText}>{loading ? 'Saving...' : 'Save New Password'}</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => router.replace('/(auth)/login')} style={styles.secondaryButton}>
              <Text style={[styles.secondaryText, { color: colors.primary }]}>Back to Sign In</Text>
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
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
  },
  contentKeyboard: {
    justifyContent: 'flex-start',
    paddingTop: Spacing.xl,
  },
  header: {
    alignItems: 'center',
    marginBottom: Spacing.xxxl,
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
  logoText: { color: Colors.white, fontSize: 28, fontWeight: '900' },
  appName: {
    fontSize: 28,
    fontWeight: '800',
    color: Colors.primary,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    marginTop: 6,
    textAlign: 'center',
    lineHeight: 20,
  },
  card: {
    borderRadius: Radius.xl,
    padding: Spacing.xxl,
    shadowColor: Colors.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 16,
    elevation: 4,
  },
  fieldGroup: { marginBottom: Spacing.lg },
  label: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 6,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    gap: Spacing.sm,
    borderWidth: 1,
  },
  input: {
    flex: 1,
    fontSize: 15,
  },
  showText: { color: Colors.primary, fontWeight: '600', fontSize: 13 },
  errorText: {
    fontSize: 12,
    marginTop: 4,
    fontWeight: '500',
  },
  button: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.md,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: Spacing.sm,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: Colors.white, fontSize: 16, fontWeight: '700' },
  secondaryButton: {
    alignItems: 'center',
    marginTop: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  secondaryText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
