import React, { createContext, useContext, useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase';

// Definizioni dei tipi
type AuthContextType = {
  user: any | null;
  session: any | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ data: any, error: string | null }>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ data: any, error: string | null }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ data: any, error: string | null }>;
};

// Valori di default
const defaultContext: AuthContextType = {
  user: null,
  session: null,
  loading: true,
  signIn: async () => ({ data: null, error: 'Contesto non inizializzato' }),
  signUp: async () => ({ data: null, error: 'Contesto non inizializzato' }),
  signOut: async () => {},
  resetPassword: async () => ({ data: null, error: 'Contesto non inizializzato' }),
};

// Creazione del contesto
const AuthContext = createContext<AuthContextType>(defaultContext);

// Hook personalizzato per accedere al contesto
export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<any | null>(null);
  const [session, setSession] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    // Controlla se esiste già una sessione
    const checkSession = async () => {
      try {
        // Ottieni sessione corrente
        const { data } = await supabase.auth.getSession();
        
        // Imposta la sessione e l'utente se esistono
        setSession(data.session);
        setUser(data.session?.user || null);
        
        // Reindirizza alla dashboard se l'utente è autenticato e sta cercando di accedere a pagine di login
        if (data.session?.user && (location.pathname === '/login' || location.pathname === '/')) {
          navigate('/app');
        }
        // Reindirizza al login se l'utente non è autenticato e sta cercando di accedere all'app
        else if (!data.session?.user && location.pathname.startsWith('/app')) {
          navigate('/login');
        }
        
        // Impostazione dei listener per i cambiamenti di autenticazione
        const { data: authListener } = supabase.auth.onAuthStateChange(
          async (event, newSession) => {
            console.log('Auth state changed:', event);
            setSession(newSession);
            setUser(newSession?.user || null);
            
            // Gestione degli eventi di autenticazione
            if (event === 'SIGNED_IN') {
              navigate('/app');
            } else if (event === 'SIGNED_OUT') {
              navigate('/login');
            }
          }
        );

        return () => {
          // Pulizia listener quando il componente viene smontato
          if (authListener && authListener.subscription) {
            authListener.subscription.unsubscribe();
          }
        };
      } catch (error) {
        console.error('Error checking session:', error);
      } finally {
        setLoading(false);
      }
    };

    checkSession();
  }, [navigate, location.pathname]);

  // Login con email/password usando direttamente Supabase
  const signIn = async (email: string, password: string) => {
    try {
      console.log('Tentativo di login per:', email);
      
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (error) {
        console.error('Errore di login:', error);
        return { 
          data: null, 
          error: error.message || 'Errore durante il login'
        };
      }

      // Aggiorna lo stato con i nuovi dati di sessione
      setSession(data.session);
      setUser(data.user);
      
      return { data, error: null };
    } catch (error: any) {
      console.error('Errore imprevisto durante il login:', error);
      return { 
        data: null, 
        error: error.message || 'Errore imprevisto durante il login' 
      };
    }
  };

  // Registrazione e creazione automatica di un abbonamento Free
  const signUp = async (email: string, password: string, fullName: string) => {
    try {
      console.log('Tentativo di registrazione per:', email);
      
      // 1. Registra utente con Supabase Auth
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
          },
        },
      });

      if (error) {
        console.error('Errore di registrazione:', error);
        return { 
          data: null, 
          error: error.message || 'Errore durante la registrazione'
        };
      }

      if (!data.user?.id) {
        return {
          data: null,
          error: 'Errore durante la creazione dell\'account. Riprova più tardi.'
        };
      }

      console.log('Registrazione completata, creazione abbonamento Free...');

      // 2. Crea abbonamento Free per il nuovo utente
      try {
        // Usiamo RPC per creare l'abbonamento (se presente) o facciamo una INSERT diretta
        const { data: subscriptionData, error: subscriptionError } = await supabase.rpc(
          'create_free_subscription_for_user',
          { user_id: data.user.id }
        );

        if (subscriptionError) {
          console.warn('Errore con RPC create_free_subscription_for_user:', subscriptionError);
          
          // Fallback: Inseriamo direttamente l'abbonamento
          const { error: insertError } = await supabase
            .from('user_subscriptions')
            .insert({
              user_id: data.user.id,
              tier: 'free',
              monthly_minutes: 30,
              minutes_used: 0,
              start_date: new Date().toISOString(),
              end_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
              is_active: true,
              price: 0
            });

          if (insertError) {
            console.error('Errore nella creazione diretta dell\'abbonamento:', insertError);
            // Non blocchiamo la registrazione se l'abbonamento fallisce
          } else {
            console.log('Abbonamento Free creato con successo (inserimento diretto)');
          }
        } else {
          console.log('Abbonamento Free creato con successo (RPC):', subscriptionData);
        }
      } catch (subscriptionError) {
        console.error('Eccezione durante creazione abbonamento:', subscriptionError);
        // Non blocchiamo la registrazione se l'abbonamento fallisce
      }

      // Aggiorna lo stato con i nuovi dati di sessione
      setSession(data.session);
      setUser(data.user);
      
      return { data, error: null };
    } catch (error: any) {
      console.error('Errore imprevisto durante la registrazione:', error);
      return { 
        data: null, 
        error: error.message || 'Errore imprevisto durante la registrazione' 
      };
    }
  };

  // Logout
  const signOut = async () => {
    try {
      await supabase.auth.signOut();
      setUser(null);
      setSession(null);
      navigate('/login');
    } catch (error) {
      console.error('Errore durante il logout:', error);
    }
  };

  // Reset password
  const resetPassword = async (email: string) => {
    try {
      const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (error) {
        return { data: null, error: error.message };
      }

      return { data, error: null };
    } catch (error: any) {
      return { data: null, error: error.message || 'Errore durante il reset della password' };
    }
  };

  // Valori forniti dal contesto
  const value = {
    user,
    session,
    loading,
    signIn,
    signUp,
    signOut,
    resetPassword,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
