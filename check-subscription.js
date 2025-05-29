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

async function checkSubscription() {
  try {
    // Trova l'utente specifico
    console.log('Cerco l\'utente yumi.aibot@gmail.com...');
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('email', 'yumi.aibot@gmail.com')
      .single();
    
    if (userError) {
      console.error('Errore nel recupero dell\'utente:', userError);
      return;
    }
    
    if (!user) {
      console.log('Utente non trovato');
      return;
    }
    
    console.log('Dettagli utente:');
    console.log({
      id: user.id,
      email: user.email,
      subscription_tier: user.subscription_tier,
      created_at: user.created_at
    });
    
    // Controlla i dettagli della sottoscrizione
    console.log('\nRecupero dettagli sottoscrizione...');
    const { data: subscription, error: subscriptionError } = await supabase
      .from('user_subscriptions')
      .select('*')
      .eq('user_id', user.id)
      .order('current_period_end', { ascending: false })
      .limit(1)
      .single();
    
    if (subscriptionError) {
      console.error('Errore nel recupero della sottoscrizione:', subscriptionError);

      // Prova a recuperare tutte le sottoscrizioni per questo utente
      console.log('\nTentativo di recuperare tutte le sottoscrizioni per questo utente...');
      const { data: allSubscriptions, error: allSubsError } = await supabase
        .from('user_subscriptions')
        .select('*')
        .eq('user_id', user.id);
      
      if (allSubsError) {
        console.error('Errore nel recupero di tutte le sottoscrizioni:', allSubsError);
      } else {
        console.log(`Trovate ${allSubscriptions.length} sottoscrizioni:`, allSubscriptions);
      }

      return;
    }
    
    console.log('Dettagli sottoscrizione:');
    console.log(subscription);
    
    // Controlla il piano di abbonamento
    console.log('\nRecupero dettagli piano...');
    const { data: plan, error: planError } = await supabase
      .from('subscription_plans')
      .select('*')
      .eq('id', subscription.plan_id)
      .single();
    
    if (planError) {
      console.error('Errore nel recupero del piano:', planError);
      
      // Recupera tutti i piani disponibili
      console.log('\nRecupero tutti i piani disponibili...');
      const { data: allPlans, error: allPlansError } = await supabase
        .from('subscription_plans')
        .select('*');
      
      if (allPlansError) {
        console.error('Errore nel recupero di tutti i piani:', allPlansError);
      } else {
        console.log('Piani disponibili:', allPlans);
      }
      
      return;
    }
    
    console.log('Dettagli piano:');
    console.log(plan);
    
    // Calcola i minuti rimanenti
    const minutiUsati = subscription.minutes_used || 0;
    const minutiTotali = plan.minutes_included || 0;
    const minutiRimanenti = Math.max(0, minutiTotali - minutiUsati);
    
    console.log('\nRiepilogo utilizzo minuti:');
    console.log({
      tier: user.subscription_tier,
      piano: plan.name,
      minutiTotali,
      minutiUsati,
      minutiRimanenti,
      inizioPeriodo: subscription.current_period_start,
      finePeriodo: subscription.current_period_end
    });
    
    // Verifica lo stato attuale
    const now = new Date();
    const startDate = new Date(subscription.current_period_start);
    const endDate = new Date(subscription.current_period_end);
    const isActive = now >= startDate && now <= endDate;
    
    console.log('\nStato dell\'abbonamento:');
    console.log({
      attivo: isActive,
      scaduto: now > endDate,
      giorniRimanenti: Math.ceil((endDate - now) / (1000 * 60 * 60 * 24))
    });
    
    // Controlla le consultazioni per questo utente
    console.log('\nRecupero consultazioni per questo utente...');
    const { data: patients, error: patientsError } = await supabase
      .from('patients')
      .select('id')
      .eq('user_id', user.id);
      
    if (patientsError) {
      console.error('Errore nel recupero dei pazienti:', patientsError);
      return;
    }
    
    if (!patients || patients.length === 0) {
      console.log('Nessun paziente trovato per questo utente');
      return;
    }
    
    const patientIds = patients.map(p => p.id);
    
    const { data: consultations, error: consultationsError } = await supabase
      .from('consultations')
      .select('*, patients(name)')
      .in('patient_id', patientIds)
      .order('created_at', { ascending: false });
    
    if (consultationsError) {
      console.error('Errore nel recupero delle consultazioni:', consultationsError);
      return;
    }
    
    console.log(`Trovate ${consultations.length} consultazioni per questo utente`);
    
    if (consultations.length > 0) {
      // Analizza la durata delle consultazioni
      const totaleSecondi = consultations.reduce((acc, c) => acc + (c.duration_seconds || 0), 0);
      const totaleMinutiCalcolati = Math.ceil(totaleSecondi / 60);
      
      console.log('\nAnalisi consultazioni:');
      console.log({
        numeroConsultazioni: consultations.length,
        durataSecondiTotale: totaleSecondi,
        minutiCalcolatiCorrettamente: totaleMinutiCalcolati,
        minutiRegistratiNellaSubscription: minutiUsati,
        differenza: totaleMinutiCalcolati - minutiUsati
      });
      
      console.log('\nUltime 3 consultazioni:');
      consultations.slice(0, 3).forEach(c => {
        console.log({
          id: c.id,
          data: c.created_at,
          paziente: c.patients?.name || 'Sconosciuto',
          durataSecondi: c.duration_seconds || 0,
          minutiCalcolati: Math.ceil((c.duration_seconds || 0) / 60)
        });
      });
    }
    
  } catch (error) {
    console.error('Errore durante l\'esecuzione della query:', error);
  }
}

// Esegui la funzione
checkSubscription().then(() => {
  console.log('\nVerifica completata');
}); 