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

async function fixSubscription() {
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
    
    // Verifica la struttura della tabella user_subscriptions
    console.log('\nVerifica struttura della tabella user_subscriptions...');
    // Creiamo un record di prova e vediamo quali campi vengono accettati
    const testRecord = {
      user_id: user.id,
      plan_id: 'test',
      current_period_start: new Date().toISOString(),
      current_period_end: new Date().toISOString(),
      minutes_used: 0,
      created_at: new Date().toISOString()
    };
    
    // Recupera tutti i piani disponibili
    console.log('\nRecupero piani disponibili...');
    const { data: plans, error: plansError } = await supabase
      .from('subscription_plans')
      .select('*');
      
    if (plansError) {
      console.error('Errore nel recupero dei piani:', plansError);
      return;
    }
    
    if (!plans || plans.length === 0) {
      console.log('Nessun piano disponibile');
      return;
    }
    
    console.log('Piani disponibili:');
    plans.forEach(plan => {
      console.log({
        id: plan.id,
        name: plan.name,
        monthly_minutes: plan.monthly_minutes,
        price_monthly: plan.price_monthly,
        stripe_price_id: plan.stripe_price_id
      });
    });
    
    // Trova il piano basic
    const basicPlan = plans.find(p => p.name.toLowerCase() === 'basic');
    if (!basicPlan) {
      console.log('Piano basic non trovato');
      return;
    }
    
    console.log('\nPiano basic selezionato:');
    console.log(basicPlan);
    
    // Calcola minuti inclusi (da monthly_minutes se disponibile)
    const minutiInclusi = basicPlan.monthly_minutes || 600; // Default a 600 se non specificato
    
    // Crea un nuovo periodo di abbonamento
    const now = new Date();
    const startDate = new Date(now.getFullYear(), now.getMonth(), 1); // Inizio del mese corrente
    const endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999); // Fine del mese corrente
    
    console.log('\nPeriodo abbonamento:');
    console.log({
      inizio: startDate.toISOString(),
      fine: endDate.toISOString()
    });
    
    // Verifica se esiste già una sottoscrizione per questo utente
    console.log('\nVerifica sottoscrizioni esistenti...');
    const { data: existingSubscriptions, error: existingSubError } = await supabase
      .from('user_subscriptions')
      .select('*')
      .eq('user_id', user.id);
    
    if (existingSubError) {
      console.error('Errore nella verifica delle sottoscrizioni esistenti:', existingSubError);
      return;
    }
    
    if (existingSubscriptions && existingSubscriptions.length > 0) {
      console.log(`Trovate ${existingSubscriptions.length} sottoscrizioni esistenti:`, existingSubscriptions);
      console.log('\nElimina sottoscrizioni esistenti...');
      
      for (const sub of existingSubscriptions) {
        const { error: deleteError } = await supabase
          .from('user_subscriptions')
          .delete()
          .eq('id', sub.id);
          
        if (deleteError) {
          console.error(`Errore nell'eliminazione della sottoscrizione ${sub.id}:`, deleteError);
        } else {
          console.log(`Sottoscrizione ${sub.id} eliminata con successo`);
        }
      }
    }
    
    // Crea una nuova sottoscrizione con solo i campi essenziali
    console.log('\nCreo una nuova sottoscrizione con campi essenziali...');
    const subscriptionData = {
      user_id: user.id,
      plan_id: basicPlan.id,
      current_period_start: startDate.toISOString(),
      current_period_end: endDate.toISOString(),
      minutes_used: 0
    };
    
    console.log('Dati sottoscrizione:', subscriptionData);
    
    const { data: newSubscription, error: newSubError } = await supabase
      .from('user_subscriptions')
      .insert([subscriptionData])
      .select();
       
    if (newSubError) {
      console.error('Errore nella creazione della sottoscrizione:', newSubError);
      return;
    }
    
    console.log('Nuova sottoscrizione creata con successo:');
    console.log(newSubscription);
    
    // Aggiorna i minuti usati in base alle consultazioni
    console.log('\nAggiorno i minuti usati in base alle consultazioni...');
    
    // Trova tutti i pazienti dell'utente
    const { data: patients, error: patientsError } = await supabase
      .from('patients')
      .select('id')
      .eq('user_id', user.id);
      
    if (patientsError) {
      console.error('Errore nel recupero dei pazienti:', patientsError);
      return;
    }
    
    if (!patients || patients.length === 0) {
      console.log('Nessun paziente trovato, minuti usati = 0');
      console.log('Sottoscrizione attivata con successo');
      return;
    }
    
    const patientIds = patients.map(p => p.id);
    
    // Trova tutte le consultazioni
    const { data: consultations, error: consultationsError } = await supabase
      .from('consultations')
      .select('duration_seconds')
      .in('patient_id', patientIds)
      .gte('created_at', startDate.toISOString())
      .lte('created_at', endDate.toISOString());
      
    if (consultationsError) {
      console.error('Errore nel recupero delle consultazioni:', consultationsError);
      return;
    }
    
    // Calcola i minuti usati
    const totalSeconds = consultations.reduce((acc, c) => acc + (c.duration_seconds || 0), 0);
    const minutesUsed = Math.ceil(totalSeconds / 60);
    
    console.log(`Totale secondi: ${totalSeconds}, minuti calcolati: ${minutesUsed}`);
    
    // Aggiorna la sottoscrizione
    if (newSubscription && newSubscription.length > 0) {
      const { error: updateError } = await supabase
        .from('user_subscriptions')
        .update({ minutes_used: minutesUsed })
        .eq('id', newSubscription[0].id);
        
      if (updateError) {
        console.error('Errore nell\'aggiornamento dei minuti usati:', updateError);
      } else {
        console.log(`Minuti usati aggiornati a ${minutesUsed}`);
      }
    }
    
    console.log('\nSottoscrizione attivata con successo');
    console.log(`L'utente ${user.email} ha ora ${minutiInclusi - minutesUsed} minuti disponibili`);
  } catch (error) {
    console.error('Errore durante l\'esecuzione della query:', error);
  }
}

// Esegui la funzione
fixSubscription().then(() => {
  console.log('\nFix completato');
}); 