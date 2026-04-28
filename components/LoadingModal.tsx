import { Modal, View, ActivityIndicator, Text, StyleSheet } from 'react-native';
import { useTheme } from '../lib/ThemeContext';

interface LoadingModalProps {
  visible: boolean;
  message?: string;
}

export default function LoadingModal({ visible, message = 'Please wait...' }: LoadingModalProps) {
  const { colors } = useTheme();
  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent>
      <View style={styles.overlay}>
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.message, { color: colors.textSecondary }]}>{message}</Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1, justifyContent: 'center', alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  card: {
    borderRadius: 16, padding: 28, alignItems: 'center', gap: 12, minWidth: 180,
    shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 12, elevation: 8,
  },
  message: { fontSize: 14, marginTop: 4 },
});
