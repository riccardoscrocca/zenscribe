import { supabase } from './supabase';

export async function transcribeAudio(audioBlob: Blob): Promise<string> {
  const sessionId = Math.random().toString(36).substring(2, 10);
  console.log(`[${sessionId}] [transcribeAudio] Inizio trascrizione...`, {
    size: audioBlob.size,
    type: audioBlob.type
  });

  try {
    // Crea un file dal blob
    const audioFile = new File([audioBlob], `recording-${sessionId}.webm`, {
      type: audioBlob.type
    });

    // Usa sempre Supabase Edge Function come endpoint
    const endpoint = 'https://qolrybalgasyxxduefqh.supabase.co/functions/v1/transcribe';

    console.log(`[${sessionId}] [transcribeAudio] Endpoint selezionato: ${endpoint}`, {
      size: audioFile.size,
      type: audioFile.type
    });

    const formData = new FormData();
    formData.append('file', audioFile);
    formData.append('model', 'whisper-1');
    formData.append('language', 'it');
    formData.append('response_format', 'text');
    formData.append('temperature', '0');
    formData.append('session_id', sessionId);
    formData.append('prompt', 'Trascrivi letteralmente tutto, incluse ripetizioni e false partenze. Non modificare, riassumere o correggere il testo.');

    // Aggiungi timeout esteso basato sulla dimensione del file
    const timeoutMs = Math.min(Math.max(audioFile.size / 512, 60000), 900000); // Min 1min, max 15min
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      const response = await fetch(endpoint, {
        method: 'POST',
        body: formData,
        headers: {
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Errore nella risposta: ${response.status} ${response.statusText}`);
      }

      const contentType = response.headers.get('content-type');
      let transcriptionText: string;

      if (contentType?.includes('application/json')) {
        const jsonResponse = await response.json();
        transcriptionText = jsonResponse.text || jsonResponse.transcript || '';
      } else {
        transcriptionText = await response.text();
      }

      if (!transcriptionText) {
        throw new Error('Trascrizione vuota ricevuta dal server');
      }

      console.log(`[${sessionId}] [transcribeAudio] Trascrizione completata`, {
        length: transcriptionText.length,
        preview: transcriptionText.substring(0, 100)
      });

      return transcriptionText;
    } catch (error: any) {
      clearTimeout(timeoutId);
      
      if (error.name === 'AbortError') {
        throw new Error(`Timeout nella richiesta dopo ${timeoutMs/1000}s. Prova con un file più piccolo o convertilo in formato m4a.`);
      }
      
      throw error;
    }
  } catch (error) {
    console.error(`[${sessionId}] [transcribeAudio] Errore:`, error);
    throw error;
  }
}

export async function uploadAndTranscribeFile(file: File): Promise<string> {
  const sessionId = Math.random().toString(36).substring(2, 10);
  console.log(`[${sessionId}] [uploadAndTranscribe] Inizio trascrizione del file...`, {
    name: file.name,
    type: file.type,
    size: file.size,
    lastModified: new Date(file.lastModified).toISOString()
  });

  // Funzione di retry con backoff esponenziale
  const fetchWithRetry = async (url: string, options: RequestInit, maxRetries = 3) => {
    let lastError: Error | null = null;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          const backoffTime = Math.min(1000 * Math.pow(2, attempt), 8000); // Max 8 secondi
          console.log(`[${sessionId}] [uploadAndTranscribe] Retry ${attempt + 1}/${maxRetries} dopo ${backoffTime}ms`);
          await new Promise(resolve => setTimeout(resolve, backoffTime));
        }
        return await fetch(url, options);
      } catch (err: any) {
        lastError = err;
        console.warn(`[${sessionId}] [uploadAndTranscribe] Tentativo ${attempt + 1} fallito:`, err.message);
      }
    }
    throw lastError || new Error('Tutti i tentativi di connessione falliti');
  };
  try {
    // Crea il FormData con il file originale
    const formData = new FormData();
    formData.append('file', file, file.name);
    formData.append('model', 'whisper-1');
    formData.append('language', 'it');
    formData.append('response_format', 'text');
    formData.append('temperature', '0');
    formData.append('session_id', sessionId);
    formData.append('prompt', 'Trascrivi letteralmente tutto, incluse ripetizioni e false partenze. Non modificare, riassumere o correggere il testo.');

    // Usa sempre Supabase Edge Function come endpoint
    const endpoint = 'https://qolrybalgasyxxduefqh.supabase.co/functions/v1/transcribe';
    console.log(`[${sessionId}] [uploadAndTranscribe] Endpoint selezionato: ${endpoint}`);

    // Aggiungi timeout esteso
    const timeoutMs = Math.min(Math.max(file.size / 1024, 30000), 600000); // Min 30s, max 10min
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      const response = await fetchWithRetry(endpoint, {
        method: 'POST',
        body: formData,
        headers: {
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        signal: controller.signal
      }, 3);  // 3 tentativi massimi
      clearTimeout(timeoutId);
      if (!response.ok) {
        let errorMessage = '';
        try {
          const errorResponseClone = response.clone();
          try {
            const errorData = await response.json();
            console.error(`[${sessionId}] [uploadAndTranscribe] Errore risposta:`, errorData);
            errorMessage = errorData.error || errorData.details || '';
            if (errorData.requestId) {
              console.log(`[${sessionId}] [uploadAndTranscribe] ID richiesta server:`, errorData.requestId);
            }
          } catch (e) {
            console.error(`[${sessionId}] [uploadAndTranscribe] Errore nel parsing JSON della risposta:`, e);
            try {
              errorMessage = await errorResponseClone.text();
            } catch (textError) {
              console.error(`[${sessionId}] [uploadAndTranscribe] Anche la lettura come testo è fallita:`, textError);
            }
          }
        } catch (e) {
          console.error(`[${sessionId}] [uploadAndTranscribe] Errore completo nell'elaborazione dell'errore:`, e);
        }
        throw new Error(`Errore trascrizione (${response.status}): ${errorMessage || response.statusText}`);
      }
      const responseClone = response.clone();
      console.log(`[${sessionId}] [uploadAndTranscribe] Parsing della risposta...`);
      try {
        const responseData = await response.json();
        console.log(`[${sessionId}] [uploadAndTranscribe] Dati risposta:`, {
          tipoRisposta: typeof responseData,
          chiavi: responseData ? Object.keys(responseData).join(', ') : 'nessuna',
          requestId: responseData.requestId || 'nessuno'
        });
        const transcription = responseData.result || responseData.text;
        if (transcription) {
          console.log(`[${sessionId}] [uploadAndTranscribe] Trascrizione completata da JSON:`, {
            lunghezza: transcription.length,
            anteprima: transcription.substring(0, 100) + '...'
          });
          return transcription;
        }
      } catch (jsonError) {
        console.log(`[${sessionId}] [uploadAndTranscribe] Risposta non è in formato JSON, provo come testo...`, jsonError);
      }
      try {
        const textResponse = await responseClone.text();
        if (textResponse) {
          console.log(`[${sessionId}] [uploadAndTranscribe] Trascrizione letta come testo:`, {
            lunghezza: textResponse.length,
            anteprima: textResponse.substring(0, 100) + '...'
          });
          return textResponse;
        }
      } catch (textError) {
        console.error(`[${sessionId}] [uploadAndTranscribe] Errore anche nella lettura come testo:`, textError);
      }
      throw new Error('Nessuna trascrizione valida ricevuta dal server');
    } catch (error: any) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        throw new Error('La richiesta è scaduta. Il server potrebbe essere sovraccarico o il file potrebbe essere troppo grande.');
      }
      throw error;
    }
  } catch (error) {
    console.error(`[${sessionId}] [uploadAndTranscribe] Errore:`, error);
    throw error;
  }
}

/**
 * Funzione specifica per l'upload e la trascrizione di file audio (ottimizzata per MP3)
 * Utilizza la funzione serverless dedicata upload-transcribe
 * Per file grandi, implementa una strategia di chunking
 */
export async function uploadAndTranscribeFileDedicated(file: File): Promise<string> {
  const sessionId = Math.random().toString(36).substring(2, 10);
  console.log(`[${sessionId}] uploadAndTranscribeFileDedicated chiamata con file:`, {
    nome: file.name,
    tipo: file.type,
    dimensione: file.size,
    dimensioneMB: `${(file.size/1024/1024).toFixed(2)}MB`
  });
  try {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('model', 'whisper-1');
    formData.append('language', 'it');
    formData.append('response_format', 'text');
    formData.append('session_id', sessionId);
    formData.append('prompt', 'Trascrivi letteralmente tutto, incluse ripetizioni e false partenze. Non modificare, riassumere o correggere il testo.');
    formData.append('temperature', '0');
    // Usa sempre Supabase Edge Function come endpoint
    const endpoint = 'https://qolrybalgasyxxduefqh.supabase.co/functions/v1/transcribe';
    console.log(`[${sessionId}] [uploadAndTranscribeFileDedicated] Endpoint selezionato: ${endpoint}`);
    const timeoutMs = Math.min(Math.max(file.size / 1024, 30000), 600000); // Min 30s, max 10min
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      const response = await fetch(endpoint, {
        method: 'POST',
        body: formData,
        headers: {
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      if (!response.ok) {
        throw new Error(`Errore nella risposta: ${response.status} ${response.statusText}`);
      }
      const responseClone = response.clone();
      try {
        const textResponse = await responseClone.text();
        if (textResponse) {
          console.log(`[${sessionId}] Trascrizione completata come testo:`, {
            lunghezza: textResponse.length,
            preview: textResponse.substring(0, 100)
          });
          if (textResponse.trim().startsWith('{') && textResponse.trim().endsWith('}')) {
            try {
              const jsonData = JSON.parse(textResponse);
              const transcription = jsonData.result || jsonData.text;
              if (transcription) {
                return transcription;
              }
            } catch (e) {
              // Non è JSON valido, usa il testo così com'è
            }
          }
          return textResponse;
        }
      } catch (textError) {
        console.error(`[${sessionId}] Errore nella lettura come testo, provo JSON:`, textError);
      }
      try {
        const jsonResponse = await response.json();
        const transcription = jsonResponse.result || jsonResponse.text;
        if (transcription) {
          console.log(`[${sessionId}] Trascrizione completata da JSON:`, {
            lunghezza: transcription.length,
            preview: transcription.substring(0, 100)
          });
          return transcription;
        }
      } catch (jsonError) {
        console.error(`[${sessionId}] Errore anche nella lettura JSON:`, jsonError);
      }
      throw new Error('Impossibile leggere la risposta della trascrizione');
    } catch (fetchError: any) {
      clearTimeout(timeoutId);
      if (fetchError.name === 'AbortError') {
        console.error(`[${sessionId}] Timeout nella richiesta dopo ${timeoutMs/1000}s`);
        throw new Error(`Timeout nella richiesta dopo ${timeoutMs/1000}s. Prova con un file più piccolo.`);
      }
      throw fetchError;
    }
  } catch (error: any) {
    console.error(`[${sessionId}] Errore durante la trascrizione:`, error);
    throw error;
  }
}

// Funzione comune per chiamare l'API di trascrizione
async function callTranscriptionApi(formData: FormData): Promise<string> {
  const sessionId = formData.get('session_id') as string || Math.random().toString(36).substring(2, 10);
  try {
    console.log(`[${sessionId}] [callTranscriptionApi] Chiamata alla funzione di trascrizione...`);
    
    // Verifica se utilizzare Edge Function Supabase o Netlify Function
    const useSupabaseFunction = true; // Imposta a false per usare la funzione Netlify
    const endpoint = useSupabaseFunction 
      ? 'https://zenscribeai.supabase.co/functions/v1/transcribe'
      : '/.netlify/functions/transcribe';
    
    console.log(`[${sessionId}] [callTranscriptionApi] Usando endpoint: ${endpoint}`);

    // Timeout esteso per file audio lunghi
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 300000); // 5 minuti di timeout
    
    // Invia richiesta all'endpoint scelto
    const response = await fetch(endpoint, {
      method: 'POST',
      body: formData,
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);

    console.log(`[${sessionId}] [callTranscriptionApi] Risposta ricevuta:`, {
      status: response.status,
      ok: response.ok,
      statusText: response.statusText
    });

    if (!response.ok) {
      // Clona la risposta prima di tentare di leggerla
      const errorResponseClone = response.clone();
      
      let errorMessage = '';
      try {
        const errorData = await response.json();
        console.error(`[${sessionId}] [callTranscriptionApi] Errore risposta:`, errorData);
        errorMessage = errorData.error || errorData.details || '';
      } catch (e) {
        console.error(`[${sessionId}] [callTranscriptionApi] Errore nel parsing JSON della risposta di errore:`, e);
        try {
          errorMessage = await errorResponseClone.text();
        } catch (textError) {
          console.error(`[${sessionId}] [callTranscriptionApi] Anche il parsing come testo è fallito:`, textError);
        }
      }
      throw new Error(`Errore trascrizione (${response.status}): ${errorMessage || response.statusText}`);
    }

    // Determina il tipo di contenuto della risposta
    const contentType = response.headers.get('Content-Type') || '';
    console.log(`[${sessionId}] [callTranscriptionApi] Tipo di contenuto risposta:`, contentType);
    
    // Per risposte di testo, le gestiamo direttamente
    if (contentType.includes('text/plain')) {
      const textResponse = await response.text();
      console.log(`[${sessionId}] [callTranscriptionApi] Trascrizione completata (testo diretto):`, {
        lunghezza: textResponse.length,
        anteprima: textResponse.substring(0, 100) + '...'
      });
      return textResponse;
    }
    
    // Per risposte JSON, estraiamo il campo result
    if (contentType.includes('application/json')) {
      const responseData = await response.json();
      console.log(`[${sessionId}] [callTranscriptionApi] Risposta JSON:`, {
        tipoRisposta: typeof responseData,
        chiavi: responseData ? Object.keys(responseData).join(', ') : 'nessuna'
      });
      
      const transcription = responseData.result;
      if (transcription) {
        console.log(`[${sessionId}] [callTranscriptionApi] Trascrizione completata (da JSON):`, {
          lunghezza: transcription.length,
          anteprima: transcription.substring(0, 100) + '...'
        });
        return transcription;
      }
    }
    
    // Fallback: leggi come testo se il JSON non contiene il risultato atteso
    try {
      const fallbackResponse = await response.clone().text();
      if (fallbackResponse) {
        console.log(`[${sessionId}] [callTranscriptionApi] Trascrizione letta come fallback:`, {
          lunghezza: fallbackResponse.length,
          anteprima: fallbackResponse.substring(0, 100) + '...'
        });
        return fallbackResponse;
      }
    } catch (textError) {
      console.error(`[${sessionId}] [callTranscriptionApi] Errore nella lettura come testo di fallback:`, textError);
    }
    
    throw new Error('Nessuna trascrizione valida ricevuta dal server');
  } catch (error) {
    console.error(`[${sessionId}] [callTranscriptionApi] Errore durante la chiamata:`, error);
    throw error;
  }
}
