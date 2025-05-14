// Script per verificare il problema di autenticazione
import { createClient } from '@supabase/supabase-js';

// Configurazione Supabase con anon key
const SUPABASE_URL = 'https://qolrybalgasyxxduefqh.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFvbHJ5YmFsZ2FzeXh4ZHVlZnFoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDQzODc2OTEsImV4cCI6MjA1OTk2MzY5MX0.u_0PbJW-srFBjLil6yt2Qvvl8T1dv7VETqrFR-LF3TA';

// Creazione client Supabase
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Funzione per testare la registrazione (necessaria per verificare il problema "Database error granting user")
async function testSignUp() {
  try {
    // Genera email casuale per evitare errori di duplicati
    const testEmail = `test_${Math.floor(Math.random() * 1000000)}@example.com`;
    const testPassword = 'Password123!';
    const testName = 'Test User';
    
    console.log(`Tentativo di registrazione con email: ${testEmail}`);
    
    // Tentativo di registrazione
    const { data, error } = await supabase.auth.signUp({
      email: testEmail,
      password: testPassword,
      options: {
        data: {
          full_name: testName,
        },
      },
    });
    
    if (error) {
      console.error('Errore di registrazione:', error.message);
      console.error('Dettagli aggiuntivi:', error);
      return;
    }
    
    console.log('Registrazione completata con successo');
    console.log('User ID:', data.user?.id);
    
    if (data.user) {
      // Verifica se l'utente è stato creato in auth.users
      const { data: authUser, error: authError } = await supabase.auth.admin.getUserById(data.user.id);
      if (authError) {
        console.error('Errore nella verifica dell\'utente in auth.users:', authError.message);
      } else {
        console.log('Utente presente in auth.users:', !!authUser);
      }
      
      // Verifica se il profilo è stato creato in public.users
      const { data: publicUser, error: publicError } = await supabase
        .from('users')
        .select('*')
        .eq('id', data.user.id)
        .single();
        
      if (publicError) {
        if (publicError.code === 'PGRST116') {
          console.error('ERRORE: Nessun record trovato nella tabella public.users!');
          console.error('Questo potrebbe essere il problema del "Database error granting user".');
          console.error('Dettagli errore:', publicError);
          
          console.log('\nPROBLEMA IDENTIFICATO:');
          console.log('1. L\'utente è stato creato in auth.users');
          console.log('2. Ma il profilo NON è stato creato in public.users');
          console.log('3. Questo è probabilmente dovuto a policy RLS mancanti o configurazione della tabella utenti');
        } else {
          console.error('Errore nella verifica del profilo in public.users:', publicError.message);
        }
      } else {
        console.log('Profilo utente presente in public.users:', !!publicUser);
      }
    }
  } catch (error) {
    console.error('Errore imprevisto durante il test:', error);
  }
}

// Esecuzione del test
testSignUp(); 