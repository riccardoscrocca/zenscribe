import { Handler } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';

// Inizializzazione del client Supabase con le variabili d'ambiente
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('Mancano le variabili d\'ambiente SUPABASE_URL o SUPABASE_SERVICE_KEY');
}

// Inizializzazione del client Supabase lato server con chiave di servizio
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

export const handler: Handler = async (event, context) => {
  // Abilita CORS per le richieste
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
  };

  // Gestisce le richieste OPTIONS (preflight)
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ message: 'Preflight success' })
    };
  }

  // Assicurati che il metodo sia POST
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Metodo non consentito' })
    };
  }

  try {
    if (!event.body) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Corpo della richiesta mancante' })
      };
    }

    // Estrai l'azione e gli altri parametri dal corpo della richiesta
    const { action, userId, tier, email, minutesUsed } = JSON.parse(event.body);

    // Verifica il token di autorizzazione (opzionale, ma consigliato)
    const authHeader = event.headers.authorization || event.headers.Authorization;
    if (!authHeader) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ error: 'Token di autorizzazione mancante' })
      };
    }

    // Esegui l'azione richiesta
    switch (action) {
      case 'getSubscriptionStatus':
        if (!userId) {
          return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ error: 'userId è richiesto' })
          };
        }

        try {
          // Ottieni lo stato dell'abbonamento
          const { data: subscription, error: subError } = await supabase
            .from('user_subscriptions')
            .select('*')
            .eq('user_id', userId)
            .maybeSingle();

          if (subError) {
            console.error('Errore recupero sottoscrizione:', subError);
            return {
              statusCode: 500,
              headers,
              body: JSON.stringify({ error: subError.message })
            };
          }

          if (!subscription) {
            // Crea un nuovo abbonamento se non esiste
            try {
              const { data: validSubscription } = await supabase.rpc('ensure_valid_subscription', {
                user_id: userId
              });
              
              // Recupera la sottoscrizione appena creata
              const { data: newSubscription, error: newSubError } = await supabase
                .from('user_subscriptions')
                .select('*')
                .eq('id', validSubscription)
                .single();
              
              if (newSubError) {
                throw newSubError;
              }
              
              // Calcola i minuti rimanenti
              const monthlyMinutes = newSubscription.monthly_minutes || 0;
              const minutesUsed = newSubscription.minutes_used || 0;
              const minutesRemaining = Math.max(0, monthlyMinutes - minutesUsed);
              
              return {
                statusCode: 200,
                headers,
                body: JSON.stringify({
                  id: newSubscription.id,
                  plan: newSubscription.tier,
                  monthlyMinutes,
                  minutesUsed,
                  minutesRemaining,
                  startDate: newSubscription.start_date,
                  endDate: newSubscription.end_date,
                  isActive: newSubscription.is_active,
                  price: getPriceForTier(newSubscription.tier)
                })
              };
            } catch (error) {
              console.error('Errore creazione sottoscrizione:', error);
              return {
                statusCode: 500,
                headers,
                body: JSON.stringify({ 
                  error: error instanceof Error ? error.message : 'Errore nella creazione sottoscrizione'
                })
              };
            }
          }
          
          // Calcola i minuti rimanenti
          const monthlyMinutes = subscription.monthly_minutes || 0;
          const usedMinutes = subscription.minutes_used || 0;
          const minutesRemaining = Math.max(0, monthlyMinutes - usedMinutes);
          
          return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
              id: subscription.id,
              plan: subscription.tier,
              monthlyMinutes,
              minutesUsed: usedMinutes,
              minutesRemaining,
              startDate: subscription.start_date,
              endDate: subscription.end_date,
              isActive: subscription.is_active,
              price: getPriceForTier(subscription.tier)
            })
          };
        } catch (error) {
          console.error('Errore imprevisto:', error);
          return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ 
              error: error instanceof Error ? error.message : 'Errore interno del server' 
            })
          };
        }

      case 'changePlan':
        if (!userId || !tier) {
          return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ error: 'userId e tier sono richiesti' })
          };
        }
        
        try {
          const { data, error } = await supabase.rpc('handle_plan_change', {
            p_user_id: userId,
            p_new_tier: tier
          });
          
          if (error) {
            console.error('Errore cambio piano:', error);
            return {
              statusCode: 500,
              headers,
              body: JSON.stringify({ 
                error: error.message,
                success: false
              })
            };
          }
          
          return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ 
              success: true,
              subscriptionId: data,
              message: `Piano ${tier} attivato con successo!`
            })
          };
        } catch (error) {
          console.error('Errore imprevisto cambio piano:', error);
          return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ 
              error: error instanceof Error ? error.message : 'Errore sconosciuto',
              success: false
            })
          };
        }

      case 'adminCreateSubscription':
        // Solo per amministratori
        if (!email) {
          return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ error: 'email è richiesta' })
          };
        }
        
        try {
          const { data, error } = await supabase.rpc('admin_create_subscription', {
            p_email: email,
            p_tier: tier || 'basic',
            p_minutes_used: minutesUsed || 0
          });
          
          if (error) {
            console.error('Errore creazione sottoscrizione:', error);
            return {
              statusCode: 500,
              headers,
              body: JSON.stringify({ 
                error: error.message,
                success: false
              })
            };
          }
          
          return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ 
              success: true,
              result: data,
              message: 'Sottoscrizione creata con successo'
            })
          };
        } catch (error) {
          console.error('Errore imprevisto creazione sottoscrizione:', error);
          return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ 
              error: error instanceof Error ? error.message : 'Errore sconosciuto',
              success: false
            })
          };
        }

      default:
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'Azione non supportata' })
        };
    }
  } catch (error) {
    console.error('Errore imprevisto:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Errore interno del server' 
      })
    };
  }
};

// Funzione di utilità per ottenere il prezzo di un tier
function getPriceForTier(tier: string): number {
  const PRICES = {
    free: 0,
    basic: 9.99,
    advanced: 19.99,
    enterprise: 49.99
  };
  
  return PRICES[tier.toLowerCase() as keyof typeof PRICES] || 0;
} 