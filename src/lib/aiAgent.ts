import { supabase } from './supabase';
import {
  generatePrompt,
  parseAIResponse,
  validateReport,
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

    const messages = generatePrompt(consultation);

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${import.meta.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-4',
        messages,
        temperature: 0.1,
        max_tokens: 2000
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Errore nella risposta AI: ${response.status} ${response.statusText}\n${errorText}`);
    }

    const data = await response.json();
    const aiContent = data.choices?.[0]?.message?.content;

    if (!aiContent) throw new Error('Nessuna risposta ricevuta dal modello AI');

    const report = parseAIResponse(aiContent);
    const warnings = validateReport(report);

    return { report, warnings };
  } catch (error) {
    console.error('AI analysis error:', error);
    throw new Error('Failed to analyze consultation');
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

    const { data, error } = await supabase
      .from('consultations')
      .insert([consultationData])
      .select()
      .single();

    if (error) {
      console.error('[saveConsultation] Insert error:', error);
      throw new Error(`Failed to save consultation: ${error.message}`);
    }

    console.log('[saveConsultation] Consultation saved successfully:', data);
    return data;
  } catch (error) {
    console.error('[saveConsultation] Error:', error);
    throw error;
  }
}
