import { createClient } from 'npm:@supabase/supabase-js@2.39.7';
import OpenAI from 'npm:openai@4.28.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// Aggiungi funzione di log
function log(message: string, data?: any) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}`;
  console.log(logMessage, data ? data : '');
}

Deno.serve(async (req) => {
  // Genera ID sessione per tracciare la richiesta
  const sessionId = Math.random().toString(36).substring(2, 10);
  log(`[${sessionId}] Richiesta ricevuta`);

  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  try {
    // Get the audio data from request
    const formData = await req.formData();
    const audioFile = formData.get('file');
    const language = formData.get('language') || 'it';
    const responseFormat = formData.get('response_format') || 'text';
    
    // Temperatura ridotta per maggiore precisione
    const temperature = 0;

    if (!audioFile) {
      throw new Error('No audio file provided');
    }
    
    log(`[${sessionId}] Audio ricevuto`, {
      hasFile: !!audioFile,
      language,
      responseFormat,
      temperature
    });

    // Get OpenAI key from environment variable
    const openaiKey = Deno.env.get('OPENAI_SECRET_KEY');
    if (!openaiKey) {
      throw new Error('OpenAI API key not found in environment variables');
    }

    // Initialize OpenAI client
    const openai = new OpenAI({
      apiKey: openaiKey
    });
    
    log(`[${sessionId}] Chiamata a OpenAI API...`);

    // Call OpenAI API with enhanced parameters
    const startTime = Date.now();
    const transcription = await openai.audio.transcriptions.create({
      file: audioFile,
      model: 'whisper-1',
      language: language as string,
      response_format: responseFormat as string,
      temperature: temperature
    });
    const duration = Date.now() - startTime;
    
    log(`[${sessionId}] Trascrizione completata in ${duration}ms`);

    // Return the transcription directly as text
    let responseBody;
    let contentType;
    
    if (responseFormat === 'json') {
      // Fornisci una risposta JSON per compatibilità
      responseBody = JSON.stringify({ 
        result: transcription,
        requestId: sessionId,
        duration: duration
      });
      contentType = 'application/json';
    } else {
      // Restituisci il testo direttamente
      responseBody = transcription;
      contentType = 'text/plain';
    }
    
    log(`[${sessionId}] Risposta inviata`, { 
      format: responseFormat,
      contentType,
      textLength: typeof transcription === 'string' ? transcription.length : 'not a string'
    });
    
    return new Response(responseBody, {
      headers: {
        ...corsHeaders,
        'Content-Type': contentType,
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log(`[${sessionId}] Errore di trascrizione:`, errorMessage);
    
    return new Response(JSON.stringify({ 
      error: errorMessage,
      requestId: sessionId
    }), {
      status: 500,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
      },
    });
  }
});