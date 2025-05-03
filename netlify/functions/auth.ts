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
    'Access-Control-Allow-Headers': 'Content-Type',
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

    const { action, email, password, userId } = JSON.parse(event.body);

    // Gestisci diverse azioni di autenticazione
    switch (action) {
      case 'signIn':
        const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password
        });

        if (signInError) {
          console.error('Errore di login:', signInError);
          
          if (signInError.message === 'Invalid login credentials') {
            return {
              statusCode: 401,
              headers,
              body: JSON.stringify({ 
                error: 'Password non corretta. Usa il link "Password dimenticata?" per reimpostarla.' 
              })
            };
          }
          
          return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ error: signInError.message })
          };
        }

        // Ottieni informazioni utente dal database
        const { data: userData, error: userError } = await supabase
          .from('users')
          .select('id, email, full_name, role, is_active, subscription_tier')
          .eq('id', signInData.user.id)
          .maybeSingle();

        if (userError) {
          console.error('Errore recupero profilo:', userError);
          return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ 
              error: 'Errore durante il recupero del profilo utente' 
            })
          };
        }

        // Se l'utente non esiste nella tabella users, crealo
        if (!userData) {
          const { data: newUser, error: createError } = await supabase
            .from('users')
            .insert([{
              id: signInData.user.id,
              email: signInData.user.email,
              is_active: true,
              role: 'doctor',
              subscription_tier: 'free'
            }])
            .select()
            .maybeSingle();

          if (createError) {
            console.error('Errore creazione profilo:', createError);
            return {
              statusCode: 500,
              headers,
              body: JSON.stringify({ 
                error: 'Errore durante la creazione del profilo utente' 
              })
            };
          }

          return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ 
              session: signInData, 
              user: newUser 
            })
          };
        }

        // Verifica che l'account sia attivo
        if (!userData.is_active) {
          return {
            statusCode: 403,
            headers,
            body: JSON.stringify({ 
              error: 'Account disattivato. Contatta il supporto per assistenza.' 
            })
          };
        }

        // Verifica abbonamento se necessario
        if (action === 'signIn') {
          try {
            const { data: subscriptionData } = await supabase.rpc('ensure_valid_subscription', {
              user_id: signInData.user.id
            });
            console.log('Sottoscrizione validata:', subscriptionData);
          } catch (subsError) {
            console.warn('Avviso verifica sottoscrizione:', subsError);
            // Continuiamo comunque con il login
          }
        }

        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ 
            session: signInData, 
            user: userData 
          })
        };

      case 'resetPassword':
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${process.env.SITE_URL || 'https://zenscribe.it'}/reset-password`,
        });

        if (resetError) {
          return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ error: resetError.message })
          };
        }

        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ 
            message: 'Se l\'indirizzo email esiste, riceverai le istruzioni per reimpostare la password.' 
          })
        };
        
      case 'validateSubscription':
        if (!userId) {
          return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ error: 'userId è richiesto per la validazione della sottoscrizione' })
          };
        }
        
        try {
          const { data: subscriptionData, error: subscriptionError } = await supabase.rpc('ensure_valid_subscription', {
            user_id: userId
          });

          if (subscriptionError) {
            console.error('Errore validazione sottoscrizione:', subscriptionError);
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