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
  try {
    console.log('[saveConsultation] Starting...', {
      patientId: consultation.patientId,
      gdprConsent,
      visitType,
      durationSeconds
    });

    if (!consultation.patientId) {
      console.error('[saveConsultation] No patient ID provided');
      throw new Error('Patient ID is required');
    }

    // Verify that the patient exists
    const { data: patient, error: patientError } = await supabase
      .from('patients')
      .select('id, first_name, last_name, user_id')
      .eq('id', consultation.patientId)
      .single();

    if (patientError) {
      console.error('[saveConsultation] Patient verification error:', patientError);
      throw new Error(`Failed to verify patient: ${patientError.message}`);
    }

    if (!patient) {
      throw new Error(`Patient with ID ${consultation.patientId} not found`);
    }

    const consultationData = {
      patient_id: consultation.patientId,
      audio_url: consultation.audioUrl,
      transcription: consultation.transcription,
      medical_report: report,
      gdpr_consent: gdprConsent,
      visita: visitType,
      duration_seconds: durationSeconds,
      motivo_visita: report.motivoVisita !== 'N.A.' ? report.motivoVisita : null,
      storia_medica: report.storiaMedica !== 'N.A.' ? report.storiaMedica : null,
      storia_ponderale: report.storiaPonderale !== 'N.A.' ? report.storiaPonderale : null,
      abitudini_alimentari: report.abitudiniAlimentari !== 'N.A.' ? report.abitudiniAlimentari : null,
      attivita_fisica: report.attivitaFisica !== 'N.A.' ? report.attivitaFisica : null,
      fattori_psi: report.fattoriPsi !== 'N.A.' ? report.fattoriPsi : null,
      esami_parametri: report.esamiParametri !== 'N.A.' ? report.esamiParametri : null,
      punti_critici: report.puntiCritici !== 'N.A.' ? report.puntiCritici : null,
      note_specialista: report.noteSpecialista !== 'N.A.' ? report.noteSpecialista : null
    };

    console.log('[saveConsultation] Saving consultation with data:', {
      ...consultationData,
      medical_report: '(omitted)',
      transcription: '(omitted)'
    });

    const { data, error } = await supabase
      .from('consultations')
      .insert([consultationData])
      .select()
      .single();

    if (error) {
      console.error('[saveConsultation] Insert error:', error);
      throw new Error(`Failed to save consultation: ${error.message}`);
    }

    console.log('[saveConsultation] Consultation saved successfully:', {
      ...data,
      medical_report: '(omitted)',
      transcription: '(omitted)'
    });
    return data;
  } catch (error) {
    console.error('[saveConsultation] Error:', error);
    throw error;
  }
}
