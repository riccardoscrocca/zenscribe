import { supabase } from './supabase';

export async function signInWithEmail(email: string, password: string) {
  try {
    console.log('📧 Tentativo di login per:', email);

    // Step 1: Login con Supabase Auth
    const { data: sessionData, error: sessionError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (sessionError) {
      console.error('❌ Errore autenticazione:', sessionError);

      return {
        data: null,
        error: sessionError.message === 'Invalid login credentials'
          ? 'Credenziali errate. Prova a reimpostare la password.'
          : 'Errore durante il login. Riprova più tardi.',
      };
    }

    const userId = sessionData.user.id;

    // Step 2: Recupera il profilo utente dalla tabella `users`
    const { data: user, error: profileError } = await supabase
      .from('users')
      .select('id, email, full_name, role, is_active, subscription_tier')
      .eq('id', userId)
      .maybeSingle();

    if (profileError) {
      console.error('❌ Errore recupero profilo:', profileError);
      return { data: null, error: 'Errore nel recupero del profilo utente.' };
    }

    if (!user) {
      console.warn('⚠️ Nessun profilo trovato. Potrebbe essere in fase di creazione da trigger Supabase.');
      return {
        data: null,
        error: 'Profilo utente non trovato. Attendi qualche istante e riprova.',
      };
    }

    if (!user.is_active) {
      console.warn('⚠️ Profilo utente disattivato:', userId);
      return {
        data: null,
        error: 'Il tuo account è disattivato. Contatta il supporto.',
      };
    }

    console.log('✅ Login riuscito per:', userId);
    return { data: { session: sessionData, user }, error: null };

  } catch (err) {
    console.error('❌ Errore imprevisto nel login:', err);
    return {
      data: null,
      error: 'Errore imprevisto. Riprova più tardi.',
    };
  }
}

export async function resetPassword(email: string) {
  try {
    const siteUrl = import.meta.env.VITE_SITE_URL || 'https://zenscribe.it';
    const redirectTo = `${siteUrl}/reset-password`;

    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });

    if (error) throw error;

    return {
      data: 'Se l\'email è registrata, riceverai un link per reimpostare la password.',
      error: null
    };
  } catch (error) {
    console.error('❌ Errore invio reset password:', error);
    return {
      data: null,
      error: 'Errore durante l\'invio della mail di reset. Riprova più tardi.',
    };
  }
}

export async function signUpWithEmail(email: string, password: string, full_name: string) {
  try {
    // 1. Registrazione con Supabase Auth
    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name }
      }
    });

    if (signUpError) {
      return { data: null, error: 'Errore durante la registrazione: ' + signUpError.message };
    }

    const user = signUpData.user;
    if (!user) {
      return { data: null, error: 'Registrazione fallita: utente non creato.' };
    }

    // 2. Inserimento nella tabella custom users
    const { error: insertError } = await supabase.from('users').insert({
      id: user.id,
      email: user.email,
      full_name,
      role: 'doctor',
      is_active: true,
      subscription_tier: 'free',
      created_at: new Date(),
      updated_at: new Date()
    });

    if (insertError) {
      // (Opzionale) Potresti voler cancellare l'utente auth appena creato in caso di errore qui
      return { data: null, error: 'Errore durante la creazione del profilo utente: ' + insertError.message };
    }

    return { data: { user }, error: null };
  } catch (err) {
    return { data: null, error: 'Errore imprevisto: ' + err.message };
  }
}
