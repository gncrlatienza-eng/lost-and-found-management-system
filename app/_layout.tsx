import { useEffect, useState } from 'react';
import { Slot, useRouter, useSegments } from 'expo-router';
import * as Linking from 'expo-linking';
import { supabase } from '../lib/supabase';
import { Session } from '@supabase/supabase-js';
import { ThemeProvider, useTheme } from '../lib/ThemeContext';
import { StatusBar } from 'expo-status-bar';
import { createSessionFromRedirectUrl, getAuthRedirectParams } from '../lib/authRedirect';

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
  const [isRecoveringPassword, setIsRecoveringPassword] = useState(false);
  const router = useRouter();
  const segments = useSegments();
  const incomingUrl = Linking.useURL();
  const [firstSegment, secondSegment] = segments as string[];

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      if (_e === 'PASSWORD_RECOVERY') {
        setIsRecoveringPassword(true);
      }

      setSession(session);
      if (!session) {
        setRole(null);
        setIsRecoveringPassword(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!incomingUrl) return;

    const handleIncomingAuthUrl = async () => {
      const { type } = getAuthRedirectParams(incomingUrl);

      if (type === 'recovery') {
        setIsRecoveringPassword(true);
      }

      try {
        await createSessionFromRedirectUrl(incomingUrl);

        if (type === 'recovery') {
          router.replace('/(auth)/reset-password');
        }
      } catch (error: any) {
        console.error('Auth redirect handling failed:', error?.message ?? error);
      }
    };

    handleIncomingAuthUrl();
  }, [incomingUrl, router]);

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
    if (isRecoveringPassword) {
      if (firstSegment !== '(auth)' || secondSegment !== 'reset-password') {
        router.replace('/(auth)/reset-password');
      }
      return;
    }

    if (session === undefined) return;       // still loading
    if (session && role === null) return;    // session exists but role not fetched yet

    const inAuth = firstSegment === '(auth)';
    const inAdmin = firstSegment === '(admin)';
    const inStudent = firstSegment === '(student)';

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
  }, [firstSegment, isRecoveringPassword, role, router, secondSegment, session]);

  return (
    <ThemeProvider>
      <ThemedApp />
    </ThemeProvider>
  );
}
