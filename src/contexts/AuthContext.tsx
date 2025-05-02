import React, { createContext, useContext, useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { signInWithEmail } from '../lib/auth';
import type { User } from '@supabase/supabase-js';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    let mounted = true;

    const initializeAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (mounted) {
          setUser(session?.user ?? null);

          // Proteggi le route /app se non loggato
          if (!session && location.pathname.startsWith('/app')) {
            navigate('/login');
          }
        }
      } catch (error) {
        console.error('Auth initialization error:', error);
        if (mounted) {
          setUser(null);
          if (location.pathname.startsWith('/app')) {
            navigate('/login');
          }
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };

    initializeAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;

      switch (event) {
        case 'SIGNED_IN':
          if (session?.user) {
            setUser(session.user);
            navigate('/app');
          }
          break;

        case 'SIGNED_OUT':
        case 'USER_DELETED':
          setUser(null);
          if (location.pathname.startsWith('/app')) {
            navigate('/login');
          }
          break;

        case 'PASSWORD_RECOVERY':
          if (session?.user) {
            setUser(session.user); // necessario per updateUser
            navigate('/reset-password'); // forza visualizzazione form
          }
          break;

        case 'TOKEN_REFRESHED':
          setUser(session?.user ?? null);
          break;
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [navigate, location.pathname]);

  const signIn = async (email: string, password: string) => {
    try {
      const { data, error } = await signInWithEmail(email, password);

      if (!error && data) {
        navigate('/app');
      }

      return { error };
    } catch (error) {
      console.error('Sign in error:', error);
      return { error: error as Error };
    }
  };

  const signOut = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setUser(null);
        localStorage.clear();
        navigate('/');
        return;
      }

      const { error } = await supabase.auth.signOut();
      if (error) console.error('Sign out error:', error);

      setUser(null);
      localStorage.clear();
      navigate('/');
    } catch (error) {
      console.error('Sign out error:', error);
      setUser(null);
      localStorage.clear();
      navigate('/');
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
