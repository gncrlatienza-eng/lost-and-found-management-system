import { useEffect, useState } from 'react';
import { Slot, useRouter, useSegments } from 'expo-router';
import { supabase } from '../lib/supabase';
import { Session } from '@supabase/supabase-js';
import { ThemeProvider, useTheme } from '../lib/ThemeContext';
import { StatusBar } from 'expo-status-bar';

function ThemedApp() {
  const { isDark } = useTheme();
  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Slot />
    </>
  );
}

export default function RootLayout() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [role, setRole] = useState<'student' | 'admin' | null>(null);
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setSession(session);
      if (!session) {
        setRole(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Fetch role whenever session changes
  useEffect(() => {
    if (!session?.user) return;

    supabase
      .from('users')
      .select('role')
      .eq('id', session.user.id)
      .single()
      .then(({ data, error }) => {
        if (error) {
          console.error('Role fetch failed:', error.message);
          setRole('student');
          return;
        }
        const fetchedRole = data?.role;
        if (fetchedRole === 'admin' || fetchedRole === 'student') {
          setRole(fetchedRole);
        } else {
          setRole('student');
        }
      });
  }, [session]);

  // Handle routing based on session + role
  useEffect(() => {
    if (session === undefined) return;       // still loading
    if (session && role === null) return;    // session exists but role not fetched yet

    const inAuth    = segments[0] === '(auth)';
    const inAdmin   = segments[0] === '(admin)';
    const inStudent = segments[0] === '(student)';

    if (!session) {
      // Not logged in — send to login
      if (!inAuth) router.replace('/(auth)/login');
    } else if (role === 'admin') {
      // Admin — must be in admin section
      if (!inAdmin) router.replace('/(admin)/');
    } else if (role === 'student') {
      // Student — must be in student section
      if (!inStudent) router.replace('/(student)/');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, role]);

  return (
    <ThemeProvider>
      <ThemedApp />
    </ThemeProvider>
  );
}