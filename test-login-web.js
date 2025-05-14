// Script per testare il login semplice di Supabase
import { createClient } from '@supabase/supabase-js';
import { JSDOM } from 'jsdom';

// Configura un ambiente simile al browser
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
  url: 'https://zenscribe.netlify.app',
  referrer: 'https://zenscribe.netlify.app',
  contentType: 'text/html',
  includeNodeLocations: true,
  storageQuota: 10000000
});

// Creazione di un localStorage mockato
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

const mockStorage = new LocalStorageMock();

// Configurazione Supabase
const TEST_URL = 'https://qolrybalgasyxxduefqh.supabase.co';
const TEST_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFvbHJ5YmFsZ2FzeXh4ZHVlZnFoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDQzODc2OTEsImV4cCI6MjA1OTk2MzY5MX0.u_0PbJW-srFBjLil6yt2Qvvl8T1dv7VETqrFR-LF3TA';

// Credenziali di test
const testEmail = 'rscrocca1982@gmail.com';
const testPassword = 'Pocket2020';

// Funzione di test
async function testLogin() {
  console.log('Inizializzazione ambiente Supabase...');
  
  // Creazione client Supabase
  const supabase = createClient(TEST_URL, TEST_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      storage: mockStorage,
      flowType: 'pkce'
    }
  });
  
  console.log('Tentativo di login con le credenziali fornite...');
  
  try {
    // Tentativo di login
    const { data, error } = await supabase.auth.signInWithPassword({
      email: testEmail,
      password: testPassword
    });
    
    if (error) {
      console.error('Errore di autenticazione:', error.message);
      
      // Se riceviamo l'errore "Database error granting user", proviamo il workaround
      if (error.message === 'Database error granting user') {
        console.log('Tentativo di workaround per "Database error granting user"...');
        
        // Attendiamo un secondo e proviamo di nuovo
        await new Promise(resolve => setTimeout(resolve, 1000));
        mockStorage.clear(); // Puliamo lo storage
        
        const retryResult = await supabase.auth.signInWithPassword({
          email: testEmail,
          password: testPassword
        });
        
        if (retryResult.error) {
          console.error('Anche il secondo tentativo ha fallito:', retryResult.error.message);
          return;
        }
        
        console.log('Secondo tentativo riuscito!');
        console.log('Dettagli utente:');
        console.log('- ID utente:', retryResult.data.user.id);
        console.log('- Email:', retryResult.data.user.email);
        return;
      }
      
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