// Funzione Edge per il rinnovo automatico delle sottoscrizioni
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
  console.log(`[${timestamp}][renewal-${sessionId}] ${message}`, data || '');
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

    log('Inizio processo di rinnovo sottoscrizioni');

    // Inizializza il client Supabase
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_KEY');

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Variabili ambiente Supabase mancanti');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    log('Client Supabase inizializzato');

    // Esegui la funzione di rinnovo
    const { data, error } = await supabase.rpc('daily_subscription_renewal');
    
    if (error) {
      log('Errore nell\'esecuzione della funzione di rinnovo', error);
      throw error;
    }

    log('Funzione di rinnovo eseguita con successo', data);

    // Restituisci risposta
    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Rinnovo sottoscrizioni completato',
        data,
        timestamp: new Date().toISOString(),
        jobId: sessionId
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    log('Errore durante il processo di rinnovo', error);
    
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