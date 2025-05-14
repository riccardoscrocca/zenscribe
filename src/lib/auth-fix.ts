import { supabase } from './supabase';

export async function signInWithEmailSimple(email: string, password: string) {
  try {
    // 🔐 Solo login base con Supabase Auth
    const { data: sessionData, error: sessionError } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (sessionError) {
      console.error('Auth error details:', sessionError);
      return {
        data: null,
        error: `Errore di autenticazione: ${sessionError.message}`
      };
    }

    if (!sessionData.user) {
      return {
        data: null,
        error: 'Nessun dato utente restituito dopo il login.'
      };
    }

    return { data: { session: sessionData }, error: null };
  } catch (error: any) {
    console.error('Errore imprevisto durante il login:', error);
    return {
      data: null,
      error: 'Si è verificato un errore imprevisto. Riprova più tardi.'
    };
  }
} 