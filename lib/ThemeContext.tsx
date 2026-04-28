import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const LightColors = {
  primary: '#006A4E', primaryDark: '#004D38', primaryLight: '#00855F',
  primaryMuted: '#E8F5F0', primarySoft: '#C8E8DF', accent: '#00B87A',
  white: '#FFFFFF', background: '#F4F7F6', surface: '#FFFFFF',
  gray100: '#F3F4F6', gray200: '#E5E7EB', gray300: '#D1D5DB',
  gray400: '#9CA3AF', gray500: '#6B7280', gray600: '#4B5563',
  gray700: '#374151', gray800: '#1F2937',
  success: '#10B981', warning: '#F59E0B', error: '#EF4444',
  text: '#1F2937', textSecondary: '#6B7280', textMuted: '#9CA3AF',
  border: '#E5E7EB', shadow: 'rgba(0,0,0,0.08)',
  card: '#FFFFFF', tabBar: '#FFFFFF', tabBarBorder: '#E5E7EB',
};

export const DarkColors = {
  primary: '#00B87A', primaryDark: '#00855F', primaryLight: '#00D48E',
  primaryMuted: '#003D2E', primarySoft: '#004D38', accent: '#00E896',
  white: '#1A1A2E', background: '#0F0F1A', surface: '#1A1A2E',
  gray100: '#1E1E2E', gray200: '#2A2A3E', gray300: '#3A3A4E',
  gray400: '#6B7280', gray500: '#9CA3AF', gray600: '#D1D5DB',
  gray700: '#E5E7EB', gray800: '#F3F4F6',
  success: '#10B981', warning: '#F59E0B', error: '#EF4444',
  text: '#F3F4F6', textSecondary: '#9CA3AF', textMuted: '#6B7280',
  border: '#2A2A3E', shadow: 'rgba(0,0,0,0.4)',
  card: '#1A1A2E', tabBar: '#1A1A2E', tabBarBorder: '#2A2A3E',
};

type ColorScheme = typeof LightColors;
interface ThemeCtx { colors: ColorScheme; isDark: boolean; toggle: () => void; }

const ThemeContext = createContext<ThemeCtx>({
  colors: LightColors, isDark: false, toggle: () => {},
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem('theme').then(v => { if (v === 'dark') setIsDark(true); });
  }, []);

  const toggle = () => {
    setIsDark(p => {
      AsyncStorage.setItem('theme', p ? 'light' : 'dark');
      return !p;
    });
  };

  return (
    <ThemeContext.Provider value={{ colors: isDark ? DarkColors : LightColors, isDark, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);