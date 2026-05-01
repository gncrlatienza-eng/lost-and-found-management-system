import { Modal, View, StyleSheet, TouchableOpacity, Image, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeft, ChevronRight, X } from 'lucide-react-native';
import { useTheme } from '../lib/ThemeContext';
import { Radius, Spacing } from '../constants/theme';

interface PhotoViewerModalProps {
  visible: boolean;
  photos: string[];
  index: number;
  onClose: () => void;
  onIndexChange: (index: number) => void;
}

export default function PhotoViewerModal({
  visible,
  photos,
  index,
  onClose,
  onIndexChange,
}: PhotoViewerModalProps) {
  const { colors } = useTheme();
  const activePhoto = photos[index];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      presentationStyle="overFullScreen"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.safe}>
        <TouchableOpacity style={styles.closeButton} onPress={onClose}>
          <X size={24} color="#fff" />
        </TouchableOpacity>

        <View style={styles.content}>
          {activePhoto ? (
            <Image source={{ uri: activePhoto }} style={styles.image} resizeMode="contain" />
          ) : (
            <View style={[styles.emptyState, { borderColor: colors.gray400 }]}>
              <Text style={styles.emptyText}>No photo available</Text>
            </View>
          )}

          {photos.length > 1 ? (
            <>
              {index > 0 ? (
                <TouchableOpacity style={[styles.navButton, { left: Spacing.lg }]} onPress={() => onIndexChange(index - 1)}>
                  <ChevronLeft size={24} color="#fff" />
                </TouchableOpacity>
              ) : null}
              {index < photos.length - 1 ? (
                <TouchableOpacity style={[styles.navButton, { right: Spacing.lg }]} onPress={() => onIndexChange(index + 1)}>
                  <ChevronRight size={24} color="#fff" />
                </TouchableOpacity>
              ) : null}
            </>
          ) : null}
        </View>

        {photos.length > 1 ? (
          <View style={styles.footer}>
            <Text style={styles.counterText}>{index + 1} / {photos.length}</Text>
          </View>
        ) : null}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
  },
  closeButton: {
    alignSelf: 'flex-end',
    padding: Spacing.lg,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  navButton: {
    position: 'absolute',
    top: '50%',
    marginTop: -24,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: {
    alignItems: 'center',
    paddingBottom: Spacing.xl,
  },
  counterText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  emptyState: {
    marginHorizontal: Spacing.xl,
    borderWidth: 1,
    borderRadius: Radius.lg,
    minHeight: 240,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
  },
});
