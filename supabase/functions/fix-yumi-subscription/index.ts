// Funzione Edge per correggere la sottoscrizione dell'utente yumi.aibot@gmail.com
import { createClient } from 'npm:@supabase/supabase-js@2.39.7';

// Configurazione CORS per consentire chiamate programmate
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// Genera un ID per tracciare l'esecuzione
const sessionId = Math.random().toString(36).substring(2, 10);

// Funzione per il logging
function log(message: string, data?: any) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}][fix-yumi-${sessionId}] ${message}`, data || '');
}

Deno.serve(async (req) => {
  // Gestione richieste OPTIONS per CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  try {
    // Verifica che la richiesta sia autorizzata con una chiave segreta
    const url = new URL(req.url);
    const apiKey = url.searchParams.get('key');
    const secretKey = Deno.env.get('RENEWAL_SECRET_KEY');

    // Controllo dell'autorizzazione - per sicurezza
    if (!apiKey || apiKey !== secretKey) {
      log('Richiesta non autorizzata');
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    log('Inizio processo di correzione sottoscrizione per yumi.aibot@gmail.com');

    // Inizializza il client Supabase
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_KEY');

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Variabili ambiente Supabase mancanti');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    log('Client Supabase inizializzato');

    // Trova l'utente yumi.aibot@gmail.com
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, email, subscription_tier')
      .eq('email', 'yumi.aibot@gmail.com')
      .single();

    if (userError) {
      log('Errore nella ricerca dell\'utente yumi.aibot@gmail.com', userError);
      throw userError;
    }

    if (!user) {
      throw new Error('Utente yumi.aibot@gmail.com non trovato');
    }

    log('Utente trovato', user);

    // Trova il piano basic
    const { data: basicPlan, error: planError } = await supabase
      .from('subscription_plans')
      .select('id, name, monthly_minutes')
      .eq('name', 'basic')
      .single();

    if (planError) {
      log('Errore nella ricerca del piano basic', planError);
      throw planError;
    }

    if (!basicPlan) {
      throw new Error('Piano basic non trovato');
    }

    log('Piano basic trovato', basicPlan);

    // Verifica se l'utente ha già una sottoscrizione attiva
    const { data: existingSubs, error: subError } = await supabase
      .from('user_subscriptions')
      .select('*')
      .eq('user_id', user.id)
      .gte('current_period_end', new Date().toISOString());

    if (subError) {
      log('Errore nella verifica delle sottoscrizioni esistenti', subError);
      throw subError;
    }

    // Se ci sono già sottoscrizioni attive, le cancelliamo
    if (existingSubs && existingSubs.length > 0) {
      log(`Trovate ${existingSubs.length} sottoscrizioni attive, le disattivo`, existingSubs);
      
      for (const sub of existingSubs) {
        const { error: deleteError } = await supabase
          .from('user_subscriptions')
          .update({ current_period_end: new Date(new Date().getTime() - 1000).toISOString() })
          .eq('id', sub.id);
          
        if (deleteError) {
          log(`Errore nella disattivazione della sottoscrizione ${sub.id}`, deleteError);
          // Continuiamo comunque
        }
      }
    }

    // Calcola le date per il nuovo periodo
    const now = new Date();
    const startDate = new Date(now.getFullYear(), now.getMonth(), 1); // Inizio mese corrente
    const endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999); // Fine mese corrente

    log('Creazione nuova sottoscrizione per il periodo', { 
      startDate: startDate.toISOString(), 
      endDate: endDate.toISOString() 
    });

    // Crea una nuova sottoscrizione
    const { data: newSub, error: createError } = await supabase
      .from('user_subscriptions')
      .insert([
        {
          user_id: user.id,
          plan_id: basicPlan.id,
          current_period_start: startDate.toISOString(),
          current_period_end: endDate.toISOString(),
          minutes_used: 0
        }
      ])
      .select()
      .single();

    if (createError) {
      log('Errore nella creazione della sottoscrizione', createError);
      throw createError;
    }

    log('Nuova sottoscrizione creata', newSub);

    // Aggiorna il tier dell'utente se necessario
    if (user.subscription_tier !== 'basic') {
      const { error: updateError } = await supabase
        .from('users')
        .update({ subscription_tier: 'basic' })
        .eq('id', user.id);

      if (updateError) {
        log('Errore nell\'aggiornamento del tier dell\'utente', updateError);
        // Non è critico, continuiamo
      } else {
        log('Tier dell\'utente aggiornato a basic');
      }
    }

    // Restituisci risposta
    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Sottoscrizione basic creata per yumi.aibot@gmail.com',
        subscription: newSub,
        minutes_available: basicPlan.monthly_minutes || 600,
        timestamp: new Date().toISOString(),
        jobId: sessionId
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    log('Errore durante il processo di correzione', error);
    
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString(),
        jobId: sessionId
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
}); 