import { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Dimensions, Animated, useColorScheme } from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { Search } from 'lucide-react-native';

const { width } = Dimensions.get('window');

export default function SplashScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const primary = isDark ? '#00B87A' : '#006A4E';
  const lensBackground = isDark ? '#003D2E' : '#E8F5F0';
  const subtitleColor = isDark ? '#00B87A' : '#00855F';
  const trackColor = isDark ? '#003329' : '#C8E8DF';
  const gradientColors = isDark
    ? (['#0F0F1A', '#003D2E', '#004D38'] as const)
    : (['#FFFFFF', '#E8F5F0', '#C8E8DF'] as const);

  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: 1,
      duration: 2500,
      useNativeDriver: false,
    }).start();

    const timer = setTimeout(() => router.replace('/(auth)/login'), 2500);
    return () => clearTimeout(timer);
  }, []);

  const barWidth = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <LinearGradient colors={gradientColors} style={styles.container}>
        <View style={styles.glassWrapper}>
          <View style={[styles.lens, { borderColor: primary, backgroundColor: lensBackground }]}>
            <Search size={44} color={primary} />
          </View>
          <View style={[styles.handle, { backgroundColor: primary }]} />
        </View>
        <View style={styles.titleBlock}>
          <Text style={[styles.title, { color: primary }]}>LAFMS</Text>
          <Text style={[styles.subtitle, { color: subtitleColor }]}>for DLSL</Text>
        </View>
        <View style={styles.progressContainer}>
          <View style={[styles.progressTrack, { backgroundColor: trackColor }]}>
            <Animated.View style={[styles.progressBar, { width: barWidth, backgroundColor: primary }]} />
          </View>
        </View>
      </LinearGradient>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  glassWrapper: { alignItems: 'flex-end', justifyContent: 'flex-end', marginBottom: 40 },
  lens: {
    width: 140, height: 140, borderRadius: 70,
    borderWidth: 10,
    alignItems: 'center', justifyContent: 'center', elevation: 8,
  },
  handle: {
    width: 10, height: 52, borderRadius: 5,
    transform: [{ rotate: '45deg' }, { translateX: 28 }, { translateY: -10 }],
  },
  titleBlock: { position: 'absolute', bottom: 80, alignItems: 'flex-end' },
  title: { fontSize: 52, fontWeight: '900', letterSpacing: -1 },
  subtitle: { fontSize: 15, fontWeight: '500', letterSpacing: 2, textTransform: 'uppercase' },
  progressContainer: { position: 'absolute', bottom: 44, width: width * 0.55 },
  progressTrack: { height: 3, borderRadius: 2, overflow: 'hidden' },
  progressBar: { height: 3, borderRadius: 2 },
});
