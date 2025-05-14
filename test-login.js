// Script per testare il login a Supabase
import { createClient } from '@supabase/supabase-js';

// Configurazione Supabase
const TEST_URL = 'https://qolrybalgasyxxduefqh.supabase.co';
const TEST_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFvbHJ5YmFsZ2FzeXh4ZHVlZnFoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDQzODc2OTEsImV4cCI6MjA1OTk2MzY5MX0.u_0PbJW-srFBjLil6yt2Qvvl8T1dv7VETqrFR-LF3TA';

// Creazione client Supabase
const supabase = createClient(TEST_URL, TEST_KEY);

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