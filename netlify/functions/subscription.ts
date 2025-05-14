import { Handler } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';

// Inizializzazione del client Supabase con le variabili d'ambiente
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

console.log('Variabili d\'ambiente per subscription:', {
  supabaseUrl: supabaseUrl ? 'Presente' : 'Mancante',
  supabaseServiceKey: supabaseServiceKey ? 'Presente' : 'Mancante'
});

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

// Controlla se una funzione RPC esiste
async function checkRpcFunctionExists(functionName: string): Promise<boolean> {
  try {
    // Tentiamo di ottenere informazioni sulla funzione dallo schema di informazione
    const { data, error } = await supabase.from('pg_proc')
      .select('proname')
      .eq('proname', functionName)
      .limit(1);
      
    if (error) {
      console.error(`Errore verifica esistenza funzione ${functionName}:`, error);
      return false;
    }
    
    return data && data.length > 0;
  } catch (err) {
    console.error(`Errore imprevisto durante verifica funzione ${functionName}:`, err);
    return false;
  }
}

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

  // Verifica autorizzazione
  const authHeader = event.headers.authorization || event.headers.Authorization;
  if (!authHeader) {
    return {
      statusCode: 401,
      headers,
      body: JSON.stringify({ error: 'Token di autorizzazione mancante' })
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

    console.log('Richiesta subscription ricevuta:', {
      method: event.httpMethod,
      path: event.path
    });

    const { action, userId, tier, minutes } = JSON.parse(event.body);

    // Gestisci diverse azioni
    switch (action) {
      case 'validateSubscription':
        if (!userId) {
          return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ error: 'userId è richiesto' })
          };
        }

        try {
          // Verifica che la funzione esista prima di chiamarla
          const functionExists = await checkRpcFunctionExists('ensure_valid_subscription');
          
          if (!functionExists) {
            console.warn('La funzione ensure_valid_subscription non esiste nel database');
            // Rispondiamo con un successo fittizio per non bloccare il client
            return {
              statusCode: 200,
              headers,
              body: JSON.stringify({ 
                subscriptionId: null,
                success: true,
                warning: 'Funzione di validazione sottoscrizione non disponibile'
              })
            };
          }
          
          const { data: subscriptionData, error: subscriptionError } = await supabase.rpc('ensure_valid_subscription', {
            user_id: userId
          });

          if (subscriptionError) {
            console.error('Errore validazione sottoscrizione:', subscriptionError);
            
            if (subscriptionError.message.includes('does not exist')) {
              // Se la funzione non esiste, non blocchiamo il client
              return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ 
                  subscriptionId: null,
                  success: true,
                  warning: 'Funzione di validazione sottoscrizione non disponibile'
                })
              };
            }
            
            return {
              statusCode: 500,
              headers,
              body: JSON.stringify({ 
                error: subscriptionError.message,
                success: false
              })
            };
          }

          return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ 
              subscriptionId: subscriptionData,
              success: true
            })
          };
        } catch (error) {
          console.error('Errore imprevisto validazione sottoscrizione:', error);
          return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ 
              error: error instanceof Error ? error.message : 'Errore sconosciuto',
              success: false
            })
          };
        }

      case 'getSubscription':
        if (!userId) {
          return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ error: 'userId è richiesto' })
          };
        }

        try {
          // Ottieni l'abbonamento direttamente dalla tabella
          const { data: subscriptionData, error: subscriptionError } = await supabase
            .from('user_subscriptions')
            .select(`
              id,
              current_period_start,
              current_period_end,
              minutes_used,
              subscription_plans (
                id,
                name,
                monthly_minutes,
                price_monthly
              )
            `)
            .eq('user_id', userId)
            .gte('current_period_end', new Date().toISOString())
            .order('current_period_end', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (subscriptionError) {
            console.error('Get subscription error:', subscriptionError);
            return {
              statusCode: 500,
              headers,
              body: JSON.stringify({ error: subscriptionError.message })
            };
          }

          return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ subscription: subscriptionData })
          };
        } catch (error) {
          console.error('Get subscription error:', error);
          return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ 
              error: error instanceof Error ? error.message : 'Errore sconosciuto'
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
          // Verifica che la funzione esista prima di chiamarla
          const functionExists = await checkRpcFunctionExists('handle_plan_change');
          
          if (!functionExists) {
            console.warn('La funzione handle_plan_change non esiste nel database');
            
            // Aggiorna direttamente senza la funzione
            const { data: userData, error: updateError } = await supabase
              .from('users')
              .update({ subscription_tier: tier })
              .eq('id', userId)
              .select()
              .single();
              
            if (updateError) {
              return {
                statusCode: 500,
                headers,
                body: JSON.stringify({ 
                  error: updateError.message,
                  success: false
                })
              };
            }
            
            return {
              statusCode: 200,
              headers,
              body: JSON.stringify({ 
                success: true,
                plan: tier,
                message: 'Piano aggiornato con successo (modalità base)'
              })
            };
          }
          
          const { data: planData, error: planError } = await supabase.rpc('handle_plan_change', {
            p_user_id: userId,
            p_new_tier: tier
          });

          if (planError) {
            console.error('Change plan error:', planError);
            return {
              statusCode: 500,
              headers,
              body: JSON.stringify({ 
                error: planError.message || 'Errore durante il cambio piano. Riprova più tardi.',
                success: false
              })
            };
          }

          return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ 
              subscriptionId: planData,
              success: true
            })
          };
        } catch (error) {
          console.error('Change plan error:', error);
          return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ 
              error: error instanceof Error ? error.message : 'Errore imprevisto durante il cambio piano.',
              success: false
            })
          };
        }

      case 'getSubscriptionStatus':
        if (!userId) {
          return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ error: 'userId è richiesto' })
          };
        }

        try {
          // Ottieni le informazioni dell'utente
          const { data: userData, error: userError } = await supabase
            .from('users')
            .select('subscription_tier')
            .eq('id', userId)
            .single();

          if (userError) {
            console.error('Get user subscription tier error:', userError);
            return {
              statusCode: 404,
              headers,
              body: JSON.stringify({ 
                error: 'Utente non trovato',
                success: false
              })
            };
          }

          // Ottieni i dettagli del piano
          const { data: planData, error: planError } = await supabase
            .from('subscription_plans')
            .select('monthly_minutes')
            .eq('name', userData.subscription_tier || 'free')
            .single();

          if (planError) {
            console.error('Get plan details error:', planError);
            return {
              statusCode: 500,
              headers,
              body: JSON.stringify({ 
                error: 'Errore nel recupero dei dettagli del piano',
                success: false
              })
            };
          }

          // Ottieni il periodo corrente
          const now = new Date();
          const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
          const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

          // Ottieni i minuti consumati questo mese
          const { data: subscriptionData, error: subscriptionError } = await supabase
            .from('user_subscriptions')
            .select('id, minutes_used')
            .eq('user_id', userId)
            .gte('current_period_end', startOfMonth.toISOString())
            .lte('current_period_start', endOfMonth.toISOString())
            .maybeSingle();

          // Calcola i minuti rimanenti
          const monthlyMinutes = planData.monthly_minutes || 0;
          const minutesUsed = subscriptionData?.minutes_used || 0;
          const minutesRemaining = Math.max(0, monthlyMinutes - minutesUsed);

          const subscriptionStatus = {
            id: subscriptionData?.id || null,
            plan: userData.subscription_tier || 'free',
            monthlyMinutes,
            minutesUsed,
            minutesRemaining,
            price: getPriceForTier(userData.subscription_tier || 'free')
          };

          return {
            statusCode: 200,
            headers,
            body: JSON.stringify(subscriptionStatus)
          };
        } catch (error) {
          console.error('Get subscription status error:', error);
          return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ 
              error: error instanceof Error ? error.message : 'Errore imprevisto durante il recupero dello stato abbonamento.',
              id: null,
              plan: 'free',
              monthlyMinutes: 30,
              minutesUsed: 0,
              minutesRemaining: 30,
              price: 0
            })
          };
        }

      case 'adminCreateSubscription':
        if (!event.body) {
          return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ error: 'Corpo della richiesta mancante' })
          };
        }

        const { email, tier: subTier, minutesUsed } = JSON.parse(event.body);

        if (!email || !subTier) {
          return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ error: 'email e tier sono richiesti' })
          };
        }

        try {
          // Verifica che la funzione esista prima di chiamarla
          const functionExists = await checkRpcFunctionExists('admin_create_subscription');
          
          if (!functionExists) {
            console.warn('La funzione admin_create_subscription non esiste nel database');
            
            // Ottieni l'utente tramite email
            const { data: userData, error: userError } = await supabase
              .from('users')
              .select('id')
              .eq('email', email)
              .single();
              
            if (userError || !userData) {
              return {
                statusCode: 404,
                headers,
                body: JSON.stringify({ 
                  error: 'Utente non trovato',
                  success: false
                })
              };
            }
            
            // Aggiorna direttamente senza la funzione
            const { error: updateError } = await supabase
              .from('users')
              .update({ subscription_tier: subTier })
              .eq('id', userData.id);
              
            if (updateError) {
              return {
                statusCode: 500,
                headers,
                body: JSON.stringify({ 
                  error: updateError.message,
                  success: false
                })
              };
            }
            
            return {
              statusCode: 200,
              headers,
              body: JSON.stringify({ 
                success: true,
                plan: subTier,
                message: 'Abbonamento creato con successo (modalità base)'
              })
            };
          }
          
          const { data: adminSubData, error: adminSubError } = await supabase.rpc('admin_create_subscription', {
            p_email: email,
            p_tier: subTier,
            p_minutes_used: minutesUsed || 0
          });

          if (adminSubError) {
            console.error('Admin create subscription error:', adminSubError);
            return {
              statusCode: 500,
              headers,
              body: JSON.stringify({ 
                error: adminSubError.message || 'Errore durante la creazione dell\'abbonamento. Riprova più tardi.',
                success: false
              })
            };
          }

          return {
            statusCode: 200,
            headers,
            body: JSON.stringify(adminSubData)
          };
        } catch (error) {
          console.error('Admin create subscription error:', error);
          return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ 
              error: error instanceof Error ? error.message : 'Errore imprevisto durante la creazione dell\'abbonamento.',
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