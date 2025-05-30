import { supabase } from './supabase';
import {
  type ConsultationData,
  type MedicalReport
} from './aiInstructions';

export async function analyzeConsultation(
  consultation: ConsultationData
): Promise<{ report: MedicalReport; warnings: string[] }> {
  try {
    if (!consultation.transcription || consultation.transcription.trim() === '') {
      throw new Error('Nessuna trascrizione disponibile da analizzare');
    }

    const response = await fetch('/.netlify/functions/analyze-consultation', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(consultation)
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Errore nell'analisi: ${response.status} ${response.statusText}\n${error}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('AI analysis error:', error);
    throw error;
  }
}

export async function saveConsultation(
  consultation: ConsultationData,
  report: MedicalReport,
  gdprConsent: boolean = false,
  visitType: 'prima_visita' | 'visita_controllo' = 'prima_visita',
  durationSeconds: number = 0
) {
  const sessionId = Math.random().toString(36).substring(2, 10);
  console.log(`[${sessionId}] [saveConsultation] Inizio salvataggio...`, {
    patientId: consultation.patientId,
    gdprConsent,
    visitType,
    durationSeconds,
    transcriptionLength: consultation.transcription?.length
  });

  try {
    // Assicurati che durationSeconds sia un valore positivo
    if (durationSeconds <= 0) {
      console.warn(`[${sessionId}] [saveConsultation] Durata non valida:`, durationSeconds);
      // Stima la durata basata sulla lunghezza della trascrizione
      const wordsCount = consultation.transcription?.split(/\s+/).length || 0;
      const charsCount = consultation.transcription?.length || 0;
      
      // Calcola la durata stimata usando entrambi i metodi e prendi il massimo
      const wordsBasedMinutes = (wordsCount / 150) * 1.2; // 150 parole/min + 20% margine
      const charsBasedMinutes = (charsCount / 750) * 1.2; // 750 caratteri/min + 20% margine
      
      const estimatedMinutes = Math.max(wordsBasedMinutes, charsBasedMinutes);
      durationSeconds = Math.max(30, Math.ceil(estimatedMinutes * 60)); // Minimo 30 secondi
      
      console.log(`[${sessionId}] [saveConsultation] Durata stimata:`, {
        words: wordsCount,
        chars: charsCount,
        wordsBasedMinutes,
        charsBasedMinutes,
        estimatedMinutes,
        durationSeconds
      });
    }

    if (!consultation.patientId) {
      throw new Error('Patient ID is required');
    }

    // Ottieni informazioni del paziente
    const { data: patient, error: patientError } = await supabase
      .from('patients')
      .select('id, first_name, last_name, user_id')
      .eq('id', consultation.patientId)
      .single();

    if (patientError) {
      console.error(`[${sessionId}] [saveConsultation] Errore verifica paziente:`, patientError);
      throw new Error(`Failed to verify patient: ${patientError.message}`);
    }

    if (!patient) {
      throw new Error(`Patient with ID ${consultation.patientId} not found`);
    }

    // Verifica la sottoscrizione dell'utente
    const { data: subscription, error: subError } = await supabase
      .from('user_subscriptions')
      .select('id, minutes_used, plan_id')
      .eq('user_id', patient.user_id)
      .gte('current_period_end', new Date().toISOString())
      .order('current_period_end', { ascending: false })
      .limit(1)
      .single();

    if (subError && subError.code !== 'PGRST116') {
      console.error(`[${sessionId}] [saveConsultation] Errore verifica sottoscrizione:`, subError);
      throw new Error(`Failed to verify subscription: ${subError.message}`);
    }

    // Salva la consultazione
    const { data: consultationData, error: consultationError } = await supabase
      .from('consultations')
      .insert({
        patient_id: consultation.patientId,
        transcription: consultation.transcription,
        medical_report: report,
        gdpr_consent: gdprConsent,
        visita: visitType,
        duration_seconds: durationSeconds,
        user_id: patient.user_id
      })
      .select()
      .single();

    if (consultationError) {
      console.error(`[${sessionId}] [saveConsultation] Errore salvataggio consultazione:`, consultationError);
      throw new Error(`Failed to save consultation: ${consultationError.message}`);
    }

    console.log(`[${sessionId}] [saveConsultation] Consultazione salvata con successo:`, {
      id: consultationData.id,
      duration: consultationData.duration_seconds
    });

    return consultationData;
  } catch (error) {
    console.error(`[${sessionId}] [saveConsultation] Errore:`, error);
    throw error;
  }
}

/**
 * Aggiorna il campo user_id nelle consultazioni esistenti che ne sono prive
 * @returns Promise<number> - Numero di record aggiornati
 */
export async function fixConsultationsWithMissingUserId() {
  try {
    console.log('[fixConsultationsWithMissingUserId] Checking for consultations with missing user_id');
    
    // Primo otteniamo tutte le consultazioni senza user_id
    const { data: consultationsWithoutUserId, error } = await supabase
      .from('consultations')
      .select('id, patient_id')
      .is('user_id', null);
    
    if (error) {
      console.error('[fixConsultationsWithMissingUserId] Error fetching consultations:', error);
      return 0;
    }
    
    console.log(`[fixConsultationsWithMissingUserId] Found ${consultationsWithoutUserId?.length || 0} consultations without user_id`);
    
    if (!consultationsWithoutUserId || consultationsWithoutUserId.length === 0) {
      return 0;
    }
    
    // Creiamo un dizionario per memorizzare la cache di user_id per ogni patient_id
    const patientUserIdCache: Record<string, string> = {};
    let updatedCount = 0;
    
    // Aggiorniamo ciascuna consultazione individualmente
    for (const consultation of consultationsWithoutUserId) {
      try {
        let userId: string | null = null;
        
        // Controlla se abbiamo già il user_id per questo patient_id nella cache
        if (patientUserIdCache[consultation.patient_id]) {
          userId = patientUserIdCache[consultation.patient_id];
        } else {
          // Altrimenti ottieni il user_id dalla tabella patients
          const { data: patient, error: patientError } = await supabase
            .from('patients')
            .select('user_id')
            .eq('id', consultation.patient_id)
            .single();
            
          if (patientError || !patient?.user_id) {
            console.warn(`[fixConsultationsWithMissingUserId] Unable to find user_id for patient ${consultation.patient_id}:`, patientError);
            continue;
          }
          
          userId = patient.user_id;
          // Salva nella cache per uso futuro
          patientUserIdCache[consultation.patient_id] = patient.user_id;
        }
        
        if (!userId) continue;
        
        // Aggiorna la consultazione con il user_id corretto
        const { error: updateError } = await supabase
          .from('consultations')
          .update({ user_id: userId })
          .eq('id', consultation.id);
          
        if (updateError) {
          console.error(`[fixConsultationsWithMissingUserId] Error updating consultation ${consultation.id}:`, updateError);
        } else {
          updatedCount++;
        }
      } catch (itemError) {
        console.error(`[fixConsultationsWithMissingUserId] Error processing consultation ${consultation.id}:`, itemError);
      }
    }
    
    console.log(`[fixConsultationsWithMissingUserId] Successfully updated ${updatedCount} consultations with missing user_id`);
    return updatedCount;
  } catch (error) {
    console.error('[fixConsultationsWithMissingUserId] Error:', error);
    return 0;
  }
}
