// Script per testare il login a Supabase con la patch per l'errore "Database error granting user"
import { createClient } from '@supabase/supabase-js';

// Creazione di un localStorage mockato per Node.js
class LocalStorageMock {
  constructor() {
    this.store = {};
  }

  getItem(key) {
    return this.store[key] || null;
  }

  setItem(key, value) {
    this.store[key] = value;
  }

  removeItem(key) {
    delete this.store[key];
  }

  clear() {
    this.store = {};
  }
}

// Configurazione localStorage
const mockStorage = new LocalStorageMock();

// Configurazione Supabase
const TEST_URL = 'https://qolrybalgasyxxduefqh.supabase.co';
const TEST_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFvbHJ5YmFsZ2FzeXh4ZHVlZnFoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDQzODc2OTEsImV4cCI6MjA1OTk2MzY5MX0.u_0PbJW-srFBjLil6yt2Qvvl8T1dv7VETqrFR-LF3TA';

// Creazione client Supabase
const supabase = createClient(TEST_URL, TEST_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    storageKey: 'sb-' + new URL(TEST_URL).hostname + '-auth-token',
    storage: mockStorage,
    detectSessionInUrl: false,
    flowType: 'pkce'
  },
  global: {
    headers: {
      'X-Client-Info': 'supabase-js@2.40.0',
    },
  },
});

// Applicazione patch per l'errore "Database error granting user"
const originalSignIn = supabase.auth.signInWithPassword;
supabase.auth.signInWithPassword = async (credentials) => {
  try {
    console.log('Tentativo di login con patch per:', credentials.email);
    const result = await originalSignIn.call(supabase.auth, credentials);
    
    if (result.error && result.error.message === 'Database error granting user') {
      console.warn('Intercettato "Database error granting user", tentativo di recovery...');
      
      // In caso di errore specifico, facciamo un secondo tentativo dopo una breve attesa
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Pulisci eventuali sessioni parziali nella local storage
      const storageKey = 'sb-' + new URL(TEST_URL).hostname + '-auth-token';
      mockStorage.removeItem(storageKey);
      
      // Riprova il login
      console.log('Secondo tentativo di login...');
      return await originalSignIn.call(supabase.auth, credentials);
    }
    
    return result;
  } catch (error) {
    console.error('Errore durante signInWithPassword:', error);
    return { data: null, error: { message: 'Errore imprevisto durante il login.' } };
  }
};

// Credenziali di test
const testEmail = 'rscrocca1982@gmail.com';
const testPassword = 'Pocket2020';

// Funzione di test
async function testLogin() {
  console.log('Tentativo di login con le credenziali fornite...');
  
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: testEmail,
      password: testPassword
    });
    
    if (error) {
      console.error('Errore di autenticazione:', error.message);
      return;
    }
    
    console.log('Login eseguito con successo!');
    console.log('Dettagli utente:');
    console.log('- ID utente:', data.user.id);
    console.log('- Email:', data.user.email);
    
    // Verifica abbonamento
    const { data: subscription, error: subError } = await supabase
      .from('user_subscriptions')
      .select('*')
      .eq('user_id', data.user.id)
      .maybeSingle();
      
    if (subError) {
      console.error('Errore nel recupero dell\'abbonamento:', subError.message);
    } else if (subscription) {
      console.log('Abbonamento attivo:');
      console.log('- Tier:', subscription.tier);
      console.log('- Minuti mensili:', subscription.monthly_minutes);
      console.log('- Minuti utilizzati:', subscription.minutes_used);
      console.log('- Minuti rimanenti:', subscription.monthly_minutes - subscription.minutes_used);
    } else {
      console.log('Nessun abbonamento trovato per questo utente.');
    }
  } catch (err) {
    console.error('Errore imprevisto durante il test:', err);
  }
}

// Esecuzione del test
testLogin(); 