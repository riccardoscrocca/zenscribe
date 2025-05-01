import { Handler } from '@netlify/functions';
import fetch from 'node-fetch';

interface ConsultationData {
  patientId: string;
  transcription: string;
  date: string;
  patientName?: string;
}

interface MedicalReport {
  motivoVisita: string;
  storiaMedica: string;
  storiaPonderale: string;
  abitudiniAlimentari: string;
  attivitaFisica: string;
  fattoriPsi: string;
  esamiParametri: string;
  puntiCritici: string;
  noteSpecialista: string;
}

function generatePrompt(consultation: ConsultationData) {
  return [
    {
      role: 'system',
      content: `Sei un assistente specializzato nell'analisi di consultazioni mediche in ambito nutrizionale. 
      Il tuo compito è analizzare la trascrizione della consultazione e creare un report strutturato.
      Rispondi SOLO in formato JSON con i seguenti campi:
      {
        "motivoVisita": "Motivo principale della visita",
        "storiaMedica": "Storia medica rilevante",
        "storiaPonderale": "Storia del peso e variazioni",
        "abitudiniAlimentari": "Abitudini alimentari attuali",
        "attivitaFisica": "Livello di attività fisica",
        "fattoriPsi": "Fattori psicologici rilevanti",
        "esamiParametri": "Esami e parametri clinici",
        "puntiCritici": "Punti critici identificati",
        "noteSpecialista": "Note aggiuntive dello specialista"
      }
      Se un'informazione non è disponibile, usa "N.A."`
    },
    {
      role: 'user',
      content: `Analizza questa consultazione:
      Data: ${consultation.date}
      Paziente: ${consultation.patientName || 'Non specificato'}
      Trascrizione:
      ${consultation.transcription}`
    }
  ];
}

function parseAIResponse(response: string): MedicalReport {
  try {
    return JSON.parse(response);
  } catch (error) {
    throw new Error('Failed to parse AI response as JSON');
  }
}

function validateReport(report: MedicalReport): string[] {
  const warnings: string[] = [];
  const requiredFields = [
    'motivoVisita',
    'storiaMedica',
    'storiaPonderale',
    'abitudiniAlimentari',
    'attivitaFisica',
    'fattoriPsi',
    'esamiParametri',
    'puntiCritici',
    'noteSpecialista'
  ];

  for (const field of requiredFields) {
    if (!(field in report)) {
      warnings.push(`Campo mancante: ${field}`);
    }
  }

  return warnings;
}

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') {
      return {
        statusCode: 405,
        body: JSON.stringify({ error: 'Method Not Allowed' }),
      };
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Missing OpenAI API key' }),
      };
    }

    if (!event.body) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'No consultation data provided' }),
      };
    }

    const consultation: ConsultationData = JSON.parse(event.body);
    
    if (!consultation.transcription || consultation.transcription.trim() === '') {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'No transcription provided' }),
      };
    }

    const messages = generatePrompt(consultation);

    console.log('Sending request to OpenAI...');
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4',
        messages,
        temperature: 0.1,
        max_tokens: 2000
      })
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('OpenAI API Error:', error);
      return {
        statusCode: response.status,
        body: JSON.stringify({ 
          error: 'OpenAI API Error',
          details: error
        }),
      };
    }

    const data = await response.json();
    const aiContent = data.choices?.[0]?.message?.content;

    if (!aiContent) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'No response from AI model' }),
      };
    }

    const report = parseAIResponse(aiContent);
    const warnings = validateReport(report);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ report, warnings }),
    };
  } catch (err: any) {
    console.error('Server error:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Server Error',
        message: err.message
      }),
    };
  }
}; 