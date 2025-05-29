const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Inizializzazione del client Supabase
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Credenziali Supabase mancanti. Verifica il file .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkActiveUsers() {
  try {
    // Controlla gli utenti nel sistema
    console.log('Recupero informazioni sugli utenti...');
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(5);
      
    if (usersError) {
      console.error('Errore nel recupero degli utenti:', usersError);
      return;
    }
    
    if (users && users.length > 0) {
      console.log('Ultimi 5 utenti registrati:');
      console.table(users.map(user => ({
        id: user.id,
        email: user.email,
        creato_il: user.created_at,
        subscription_tier: user.subscription_tier || 'Nessuno'
      })));
    } else {
      console.log('Nessun utente trovato nel database');
    }

    // Verifica se ci sono consultazioni recenti per avere un'idea degli utenti attivi
    console.log('\nRecupero ultime consultazioni...');
    const { data: consultations, error: consultationsError } = await supabase
      .from('consultations')
      .select(`
        id, 
        created_at, 
        patients(id, name, user_id, users(email))
      `)
      .order('created_at', { ascending: false })
      .limit(5);
    
    if (consultationsError) {
      console.error('Errore nel recupero delle consultazioni:', consultationsError);
    } else if (consultations && consultations.length > 0) {
      console.log('Ultime 5 consultazioni:');
      console.table(consultations.map(c => ({
        id: c.id,
        data: c.created_at,
        paziente: c.patients?.name || 'Sconosciuto',
        utente: c.patients?.users?.email || 'Sconosciuto'
      })));
    } else {
      console.log('Nessuna consultazione trovata');
    }
    
    // Verifica le sottoscrizioni attive
    console.log('\nRecupero sottoscrizioni attive...');
    const { data: subscriptions, error: subscriptionsError } = await supabase
      .from('user_subscriptions')
      .select(`
        id,
        user_id,
        current_period_start,
        current_period_end,
        minutes_used,
        users(email)
      `)
      .eq('status', 'active')
      .order('current_period_end', { ascending: false })
      .limit(5);
    
    if (subscriptionsError) {
      console.error('Errore nel recupero delle sottoscrizioni:', subscriptionsError);
    } else if (subscriptions && subscriptions.length > 0) {
      console.log('Sottoscrizioni attive:');
      console.table(subscriptions.map(s => ({
        utente: s.users?.email || 'Sconosciuto',
        inizio: s.current_period_start,
        fine: s.current_period_end,
        minuti_usati: s.minutes_used || 0
      })));
    } else {
      console.log('Nessuna sottoscrizione attiva trovata');
    }
    
  } catch (error) {
    console.error('Errore durante l\'esecuzione della query:', error);
  }
}

// Esegui la funzione
checkActiveUsers().then(() => {
  console.log('\nVerifica completata');
}); 