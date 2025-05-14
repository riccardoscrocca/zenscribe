import { Handler } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';

// Inizializza il client Supabase con la chiave di servizio (admin)
const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY || '';

console.log('🚀 Inizializzazione funzione user-profile');
console.log('🔗 URL Supabase:', supabaseUrl ? `${supabaseUrl.substring(0, 15)}...` : 'mancante');
console.log('🔑 Chiave servizio:', supabaseServiceKey ? 'presente' : 'mancante');

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ ERRORE: Mancano le variabili di ambiente SUPABASE_URL o SUPABASE_SERVICE_KEY');
}

// Client Supabase con privilegi admin
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

const handler: Handler = async (event) => {
  console.log('📥 Richiesta ricevuta:', {
    method: event.httpMethod,
    path: event.path,
    headers: Object.keys(event.headers)
  });

  // Verifica che sia una richiesta POST
  if (event.httpMethod !== 'POST') {
    console.warn('⚠️ Metodo non consentito:', event.httpMethod);
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Metodo non consentito' })
    };
  }

  // Tenta di estrarre i dati utente dal body
  try {
    console.log('📦 Body ricevuto:', event.body);
    const { user_id, email } = JSON.parse(event.body || '{}');
    console.log('👤 Dati utente estratti:', { user_id, email: email ? `${email.substring(0, 3)}...` : undefined });

    if (!user_id || !email) {
      console.warn('⚠️ Dati mancanti:', { user_id: !!user_id, email: !!email });
      return {
        statusCode: 400,
        body: JSON.stringify({ 
          error: 'Richiesta non valida. user_id e email sono obbligatori.' 
        })
      };
    }

    console.log('🔍 Verifico esistenza profilo per user_id:', user_id);
    // Verifica prima se il profilo già esiste
    const { data: existingUser, error: fetchError } = await supabaseAdmin
      .from('users')
      .select('id, email')
      .eq('id', user_id)
      .maybeSingle();

    if (fetchError) {
      console.error('❌ Errore durante la verifica del profilo:', fetchError);
      return {
        statusCode: 500,
        body: JSON.stringify({ 
          error: 'Errore durante la verifica del profilo utente',
          details: fetchError
        })
      };
    }

    // Se il profilo esiste già, lo restituiamo
    if (existingUser) {
      console.log('✅ Profilo esistente trovato:', existingUser);
      return {
        statusCode: 200,
        body: JSON.stringify({ 
          message: 'Profilo utente già esistente',
          user: existingUser
        })
      };
    }

    console.log('➕ Creazione nuovo profilo per:', user_id);
    // Crea un nuovo profilo utente
    const { data: newUser, error: createError } = await supabaseAdmin
      .from('users')
      .insert([{
        id: user_id,
        email: email,
        is_active: true,
        role: 'doctor',
        subscription_tier: 'free',
        created_at: new Date().toISOString()
      }])
      .select()
      .maybeSingle();

    if (createError) {
      console.error('❌ Errore durante la creazione del profilo:', createError);
      return {
        statusCode: 500,
        body: JSON.stringify({ 
          error: 'Errore durante la creazione del profilo utente',
          details: createError
        })
      };
    }

    console.log('✅ Profilo creato con successo:', newUser);

    // Crea un abbonamento free per il nuovo utente
    try {
      console.log('💰 Creazione abbonamento free per:', user_id);
      const { data: subscription, error: subscriptionError } = await supabaseAdmin
        .from('user_subscriptions')
        .insert({
          user_id: user_id,
          tier: 'free',
          monthly_minutes: 30,
          minutes_used: 0,
          start_date: new Date().toISOString(),
          end_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          is_active: true,
          price: 0
        })
        .select()
        .maybeSingle();

      if (subscriptionError) {
        console.warn('⚠️ Errore durante la creazione dell\'abbonamento:', subscriptionError);
        // Non blocchiamo la creazione del profilo se l'abbonamento fallisce
      } else {
        console.log('✅ Abbonamento creato con successo:', subscription);
      }
    } catch (subscriptionErr) {
      console.error('❌ Eccezione durante la creazione dell\'abbonamento:', subscriptionErr);
      // Non blocchiamo la creazione del profilo se l'abbonamento fallisce
    }

    console.log('🏁 Operazione completata con successo');
    return {
      statusCode: 201,
      body: JSON.stringify({ 
        message: 'Profilo utente creato con successo',
        user: newUser
      })
    };
  } catch (error) {
    console.error('❌ Errore durante l\'elaborazione della richiesta:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ 
        error: 'Errore imprevisto durante l\'elaborazione della richiesta',
        details: error
      })
    };
  }
};

export { handler }; 