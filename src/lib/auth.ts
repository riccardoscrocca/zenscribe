import { supabase } from './supabase';

export async function signInWithEmail(email: string, password: string) {
  try {
    // 🔐 1. Prova a fare login con Supabase Auth
    const { data: sessionData, error: sessionError } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (sessionError) {
      console.error('Auth error details:', sessionError);

      if (sessionError.message === 'Invalid login credentials') {
        return {
          data: null,
          error: 'Password non corretta. Usa il link "Password dimenticata?" per reimpostarla.'
        };
      }

      return {
        data: null,
        error: 'Errore durante l\'accesso. Riprova più tardi.'
      };
    }

    if (!sessionData.user) {
      return {
        data: null,
        error: 'Nessun dato utente restituito dopo il login.'
      };
    }

    const userId = sessionData.user.id;
    const userEmail = sessionData.user.email;

    // 🧠 2. Recupera (o crea) il profilo nella tabella "users"
    let retryCount = 0;
    const maxRetries = 3;

    while (retryCount < maxRetries) {
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('id, email, full_name, role, is_active, subscription_tier')
        .eq('id', userId)
        .maybeSingle();

      if (userError) {
        console.error(`Errore query profilo (tentativo ${retryCount + 1}):`, userError);
        retryCount++;
        await new Promise(res => setTimeout(res, 1000 * retryCount));
        continue;
      }

      // 🆕 Se il profilo non esiste, crealo
      if (!userData) {
        const { data: newUser, error: createError } = await supabase
          .from('users')
          .insert([{
            id: userId,
            email: userEmail,
            is_active: true,
            role: 'doctor',
            subscription_tier: 'free'
          }])
          .select()
          .maybeSingle();

        if (createError) {
          console.error('Errore durante la creazione del profilo:', createError);
          return {
            data: null,
            error: 'Errore durante la creazione del profilo utente. Riprova più tardi.'
          };
        }

        return { data: { session: sessionData, user: newUser }, error: null };
      }

      if (!userData.is_active) {
        return {
          data: null,
          error: 'Account disattivato. Contatta il supporto per assistenza.'
        };
      }

      return { data: { session: sessionData, user: userData }, error: null };
    }

    return {
      data: null,
      error: 'Errore durante il recupero del profilo. Riprova più tardi.'
    };
  } catch (error: any) {
    console.error('Errore imprevisto durante il login:', error);
    return {
      data: null,
      error: 'Si è verificato un errore imprevisto. Riprova più tardi.'
    };
  }
}

export async function resetPassword(email: string) {
  try {
    const siteUrl = import.meta.env.VITE_SITE_URL || 'https://zenscribe.it';
    const resetUrl = `${siteUrl}/reset-password`;

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: resetUrl,
    });

    if (error) throw error;

    return {
      data: 'Se l\'indirizzo email esiste, riceverai le istruzioni per reimpostare la password.',
      error: null
    };
  } catch (error: any) {
    console.error('Errore invio reset password:', error);
    return {
      data: null,
      error: 'Impossibile inviare l\'email di reset. Riprova più tardi.'
    };
  }
}
