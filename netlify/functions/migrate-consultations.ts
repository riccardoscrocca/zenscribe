import { Handler, HandlerEvent, HandlerContext } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

// Carica le variabili d'ambiente
config();

// Configurazione Supabase
const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

// Client con diritti di servizio (bypassa RLS)
const adminClient = createClient(supabaseUrl, supabaseServiceKey);

// Client anonimo (rispetta RLS)
const supabase = createClient(supabaseUrl, supabaseAnonKey);

const handler: Handler = async (event: HandlerEvent, context: HandlerContext) => {
  try {
    // Verifica se è una richiesta autorizzata
    if (event.httpMethod !== 'POST') {
      return {
        statusCode: 405,
        body: JSON.stringify({ error: 'Metodo non consentito' })
      };
    }

    const token = event.headers.authorization?.split('Bearer ')[1];
    if (!token) {
      return {
        statusCode: 401,
        body: JSON.stringify({ error: 'Autenticazione richiesta' })
      };
    }

    // Verifica il token e ottieni l'utente
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return {
        statusCode: 401,
        body: JSON.stringify({ error: 'Token non valido' })
      };
    }

    // Verifica se l'utente è admin
    const { data: userData, error: userError } = await adminClient
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (userError || !userData || !['admin', 'superadmin'].includes(userData.role)) {
      return {
        statusCode: 403,
        body: JSON.stringify({ error: 'Accesso negato. Solo gli amministratori possono eseguire questa operazione.' })
      };
    }

    console.log('Inizio migrazione consultazioni senza user_id');

    // Ottieni tutte le consultazioni senza user_id
    const { data: consultationsWithoutUserId, error: consultationsError } = await adminClient
      .from('consultations')
      .select('id, patient_id')
      .is('user_id', null);

    if (consultationsError) {
      throw new Error(`Errore nel recupero delle consultazioni: ${consultationsError.message}`);
    }

    console.log(`Trovate ${consultationsWithoutUserId?.length || 0} consultazioni senza user_id`);

    if (!consultationsWithoutUserId || consultationsWithoutUserId.length === 0) {
      return {
        statusCode: 200,
        body: JSON.stringify({ message: 'Nessuna consultazione da aggiornare', updated: 0 })
      };
    }

    // Cache per user_id dei pazienti
    const patientUserIdCache: Record<string, string> = {};
    let updatedCount = 0;
    const errors: { consultationId: string; error: string }[] = [];

    // Aggiorna ogni consultazione
    for (const consultation of consultationsWithoutUserId) {
      try {
        let userId: string | null = null;

        // Usa la cache se disponibile
        if (patientUserIdCache[consultation.patient_id]) {
          userId = patientUserIdCache[consultation.patient_id];
        } else {
          // Ottieni il user_id dalla tabella patients
          const { data: patient, error: patientError } = await adminClient
            .from('patients')
            .select('user_id')
            .eq('id', consultation.patient_id)
            .single();

          if (patientError || !patient?.user_id) {
            const errorMsg = `Impossibile trovare user_id per patient_id ${consultation.patient_id}`;
            console.warn(errorMsg, patientError);
            errors.push({ consultationId: consultation.id, error: errorMsg });
            continue;
          }

          userId = patient.user_id;
          patientUserIdCache[consultation.patient_id] = patient.user_id;
        }

        if (!userId) continue;

        // Aggiorna la consultazione
        const { error: updateError } = await adminClient
          .from('consultations')
          .update({ user_id: userId })
          .eq('id', consultation.id);

        if (updateError) {
          const errorMsg = `Errore nell'aggiornamento della consultazione ${consultation.id}: ${updateError.message}`;
          console.error(errorMsg);
          errors.push({ consultationId: consultation.id, error: errorMsg });
        } else {
          updatedCount++;
        }
      } catch (err) {
        const error = err as Error;
        const errorMsg = `Errore imprevisto per consultazione ${consultation.id}: ${error.message}`;
        console.error(errorMsg);
        errors.push({ consultationId: consultation.id, error: errorMsg });
      }
    }

    console.log(`Aggiornate con successo ${updatedCount} consultazioni su ${consultationsWithoutUserId.length}`);

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: `Aggiornate con successo ${updatedCount} consultazioni su ${consultationsWithoutUserId.length}`,
        updated: updatedCount,
        errors: errors.length > 0 ? errors : undefined
      })
    };
  } catch (err) {
    const error = err as Error;
    console.error('Errore nella migrazione:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: `Errore durante l'esecuzione: ${error.message}` })
    };
  }
};

export { handler }; 