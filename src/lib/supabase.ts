import { createClient } from '@supabase/supabase-js';
import { AuthTokenResponsePassword, SignInWithPasswordCredentials } from '@supabase/supabase-js';

// Utilizziamo un tipo più semplice per le nostre credenziali
type EmailCredentials = {
  email?: string;
  password?: string;
};

// Configurazione per i tentativi di ripetizione
const MAX_RETRIES = 3;
const RETRY_DELAY_BASE = 1000; // 1 secondo

// Controlla se siamo in modalità di test
const isTestMode = true;

// Impostazioni di test
const TEST_URL = 'https://qolrybalgasyxxduefqh.supabase.co';
const TEST_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFvbHJ5YmFsZ2FzeXh4ZHVlZnFoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDQzODc2OTEsImV4cCI6MjA1OTk2MzY5MX0.u_0PbJW-srFBjLil6yt2Qvvl8T1dv7VETqrFR-LF3TA';

// Usa le variabili d'ambiente o le impostazioni di test
const supabaseUrl = isTestMode ? TEST_URL : import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = isTestMode ? TEST_KEY : import.meta.env.VITE_SUPABASE_ANON_KEY;

console.log('Supabase config iniziale:', {
  url: supabaseUrl ? `${supabaseUrl.substring(0, 10)}...` : 'undefined',
  anonKey: supabaseAnonKey ? 'presente (nascosta)' : 'undefined',
  isTestMode: isTestMode
});

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Mancano le variabili d\'ambiente di Supabase');
}

// Create a single, stable instance of the Supabase client
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    // Use a consistent storage key format
    storageKey: 'sb-' + new URL(supabaseUrl).hostname + '-auth-token',
    storage: localStorage,
    detectSessionInUrl: true,
    flowType: 'pkce'
  },
  global: {
    headers: {
      'X-Client-Info': 'supabase-js@2.40.0',
    },
  },
});

// Patch migliorata per l'errore "Database error granting user"
const originalSignIn = supabase.auth.signInWithPassword;
supabase.auth.signInWithPassword = async (credentials: SignInWithPasswordCredentials) => {
  try {
    // Cast per accedere alla email in modo sicuro
    const emailData = credentials as unknown as EmailCredentials;
    const emailPreview = emailData.email ? 
      emailData.email.substring(0, 3) + '***' : 'unknown';
    
    console.log('📧 Tentativo di login per:', emailPreview);
    
    // Prima di tutto, proviamo a verificare se l'utente esiste già
    const { data: existingSession } = await supabase.auth.getSession();
    if (existingSession?.session) {
      // Se c'è già una sessione attiva, facciamo logout prima di provare a fare login
      console.log('⚠️ Sessione esistente trovata, effettuo logout preventivo');
      await supabase.auth.signOut();
      // Attendiamo un momento per dare tempo al server di completare il logout
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    // Primo tentativo di login
    let result = await originalSignIn.call(supabase.auth, credentials);
    
    // Se c'è un qualsiasi errore, facciamo fino a MAX_RETRIES tentativi con pausa esponenziale
    if (result.error) {
      console.warn(`❌ Errore login: "${result.error.message}". Avvio procedura di recovery...`);
      
      // Pulisci eventuali sessioni parziali nella local storage
      const storageKey = 'sb-' + new URL(supabaseUrl).hostname + '-auth-token';
      localStorage.removeItem(storageKey);
      
      // Tentativi multipli con pausa esponenziale
      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        console.log(`🔄 Tentativo di recovery ${attempt}/${MAX_RETRIES}...`);
        
        // Pausa esponenziale
        const pauseTime = RETRY_DELAY_BASE * Math.pow(2, attempt - 1);
        await new Promise(resolve => setTimeout(resolve, pauseTime));
        
        // Riprova il login
        result = await originalSignIn.call(supabase.auth, credentials);
        
        // Se il login ha avuto successo, interrompi i tentativi
        if (!result.error) {
          console.log(`✅ Recovery riuscito al tentativo ${attempt}!`);
          break;
        }
        
        console.warn(`❌ Tentativo ${attempt} fallito:`, result.error);
      }
      
      // Se dopo tutti i tentativi c'è ancora un errore, proviamo un approccio alternativo
      if (result.error && emailData.email) {
        if (result.error.message === 'Database error granting user') {
          console.warn("🔧 Errore di RLS persistente. Tentativo con serverless function...");
          
          try {
            // Prova ad autenticare con Supabase ma senza creare il profilo
            const { data: authData, error: authError } = await originalSignIn.call(supabase.auth, credentials);
            
            if (!authError && authData?.user) {
              // Se l'auth funziona, prova a creare il profilo con la funzione serverless
              const createProfileResponse = await fetch('/.netlify/functions/user-profile', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  user_id: authData.user.id,
                  email: authData.user.email
                })
              });
              
              const profileResult = await createProfileResponse.json();
              console.log("🔧 Risultato creazione profilo serverless:", profileResult);
              
              // Restituisci i dati di autenticazione originali
              return { data: authData, error: null };
            }
          } catch (e) {
            console.error("❌ Errore durante il tentativo serverless:", e);
          }
        }
        
        // Ultima risorsa: invia link OTP
        console.warn("📧 Tutti i tentativi falliti, invio link di magic link come fallback...");
        try {
          const otpResult = await supabase.auth.signInWithOtp({
            email: emailData.email,
          });
          
          if (!otpResult.error) {
            console.log("📧 Inviato magic link come fallback");
            return {
              data: { user: null, session: null },
              error: {
                message: "Per motivi di sicurezza, abbiamo inviato un link di accesso alla tua email. Controlla la tua casella di posta.",
                status: 0
              }
            } as AuthTokenResponsePassword;
          }
        } catch (e) {
          console.error("❌ Anche il link di fallback è fallito:", e);
        }
      }
    }
    
    return result;
  } catch (error) {
    console.error('❌ Errore imprevisto durante signInWithPassword:', error);
    return { 
      data: { user: null, session: null },
      error: { message: 'Errore imprevisto durante il login.', status: 0 }
    } as AuthTokenResponsePassword;
  }
};