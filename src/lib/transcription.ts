export async function transcribeAudio(audioBlob: Blob): Promise<string> {
  const sessionId = Math.random().toString(36).substring(2, 10);
  try {
    console.log(`[${sessionId}] [transcribeAudio] Inizio trascrizione...`, {
      type: audioBlob.type,
      size: audioBlob.size,
      tipoFile: audioBlob.type || 'sconosciuto'
    });

    // Determina l'estensione del file in base al tipo MIME
    let extension = 'webm';
    let mimeType = audioBlob.type || '';
    
    if (mimeType.includes('mp3') || mimeType.includes('mpeg')) {
      extension = 'mp3';
      console.log(`[${sessionId}] [transcribeAudio] Rilevato file MP3`);
    } else if (mimeType.includes('wav')) {
      extension = 'wav';
      console.log(`[${sessionId}] [transcribeAudio] Rilevato file WAV`);
    } else if (mimeType.includes('m4a') || mimeType.includes('mp4')) {
      extension = 'm4a';
      console.log(`[${sessionId}] [transcribeAudio] Rilevato file M4A/MP4`);
    } else {
      console.log(`[${sessionId}] [transcribeAudio] Tipo di file non riconosciuto, uso default webm`);
    }

    console.log(`[${sessionId}] [transcribeAudio] Estensione determinata:`, extension);

    // Crea una copia del blob con il tipo MIME corretto se necessario
    let audioFile = audioBlob;
    if (!audioBlob.type || audioBlob.type === 'audio/mp3') {
      // Correggi il MIME type per i file MP3
      audioFile = new Blob([audioBlob], { type: 'audio/mpeg' });
      console.log(`[${sessionId}] [transcribeAudio] Creato nuovo blob con tipo MIME corretto:`, audioFile.type);
    }

    // Crea FormData per inviare l'audio alla Netlify Function
    const formData = new FormData();
    const fileName = `recording.${extension}`;
    formData.append('file', audioFile, fileName);
    formData.append('model', 'whisper-1');
    formData.append('language', 'it');
    formData.append('response_format', 'text');
    formData.append('temperature', '0');
    formData.append('session_id', sessionId);
    // Aggiungi prompt per trascrizione letterale
    formData.append('prompt', 'Trascrivi letteralmente tutto, incluse ripetizioni e false partenze. Non modificare, riassumere o correggere il testo.');

    console.log(`[${sessionId}] [transcribeAudio] FormData creato, invio file...`, {
      filename: fileName,
      type: audioFile.type,
      keys: [...formData.keys()].join(', ')
    });

    return await callTranscriptionApi(formData);
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
    // Determina l'estensione del file in base al tipo MIME o al nome
    let extension = 'webm';
    let mimeType = file.type || '';
    
    if (file.name.toLowerCase().endsWith('.mp3') || mimeType.includes('mp3') || mimeType.includes('mpeg')) {
      extension = 'mp3';
      // Correggi il MIME type per MP3 se necessario
      if (!mimeType || mimeType === 'audio/mp3' || mimeType === 'application/octet-stream') {
        console.log(`[${sessionId}] [uploadAndTranscribe] Correzione del MIME type per il file MP3`);
        // Crea una nuova copia del file con il MIME type corretto
        const correctedFile = new File([file], file.name, { type: 'audio/mpeg' });
        file = correctedFile;
        mimeType = 'audio/mpeg';
      }
      console.log(`[${sessionId}] [uploadAndTranscribe] Rilevato file MP3 con MIME type:`, mimeType);
      
      // Per i file MP3, tenta di utilizzare la funzione dedicata se la dimensione è maggiore di 3MB
      if (file.size > 3 * 1024 * 1024) {
        console.log(`[${sessionId}] [uploadAndTranscribe] File MP3 grande (${(file.size/1024/1024).toFixed(2)}MB), uso funzione dedicata`);
        try {
          console.log(`[${sessionId}] [uploadAndTranscribe] Tentativo con uploadAndTranscribeFileDedicated...`);
          const result = await uploadAndTranscribeFileDedicated(file);
          console.log(`[${sessionId}] [uploadAndTranscribe] Trascrizione completata con successo usando funzione dedicata`);
          return result;
        } catch (dedicatedError) {
          console.error(`[${sessionId}] [uploadAndTranscribe] Errore con funzione dedicata, ritorno al metodo standard:`, dedicatedError);
          // Continua con il metodo standard se fallisce
        }
      }
    } else if (file.name.toLowerCase().endsWith('.wav') || mimeType.includes('wav')) {
      extension = 'wav';
      console.log(`[${sessionId}] [uploadAndTranscribe] Rilevato file WAV`);
    } else if (file.name.toLowerCase().endsWith('.m4a') || mimeType.includes('m4a') || mimeType.includes('mp4')) {
      extension = 'm4a';
      console.log(`[${sessionId}] [uploadAndTranscribe] Rilevato file M4A/MP4`);
    } else {
      console.log(`[${sessionId}] [uploadAndTranscribe] Tipo di file sconosciuto, uso nome originale:`, file.name);
    }

    // Crea il FormData con il file originale
    const formData = new FormData();
    
    // Importante: usiamo esplicitamente "file" come nome del campo
    formData.append('file', file, file.name);
    formData.append('model', 'whisper-1');
    formData.append('language', 'it');
    formData.append('response_format', 'text');
    formData.append('temperature', '0');
    formData.append('session_id', sessionId);
    // Aggiungi prompt per trascrizione letterale
    formData.append('prompt', 'Trascrivi letteralmente tutto, incluse ripetizioni e false partenze. Non modificare, riassumere o correggere il testo.');
    
    // Debug log
    for (const pair of formData.entries()) {
      console.log(`[${sessionId}] [uploadAndTranscribe] FormData entry:`, pair[0], 
        pair[0] === 'file' ? `File: ${file.name}, type: ${file.type}, size: ${file.size}` : pair[1]);
    }

    console.log(`[${sessionId}] [uploadAndTranscribe] FormData creato, invio file...`);

    // Chiamata diretta alla funzione serverless
    console.log(`[${sessionId}] [uploadAndTranscribe] Chiamata alla funzione Netlify...`);
    
    // Aggiungi timeout esteso
    const timeoutMs = Math.min(Math.max(file.size / 1024, 30000), 600000); // Min 30s, max 10min
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    
    try {
      const response = await fetchWithRetry('/.netlify/functions/transcribe-audio', {
        method: 'POST',
        body: formData,
        signal: controller.signal
      }, 3);  // 3 tentativi massimi

      clearTimeout(timeoutId);
      
      console.log(`[${sessionId}] [uploadAndTranscribe] Risposta ricevuta:`, {
        status: response.status,
        ok: response.ok,
        statusText: response.statusText
      });

      if (!response.ok) {
        let errorMessage = '';
        try {
          // Clone response first
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

      // Clona immediatamente la risposta per poterla leggere più volte se necessario
      const responseClone = response.clone();
      
      console.log(`[${sessionId}] [uploadAndTranscribe] Parsing della risposta...`);
      
      // Prima prova a leggere come JSON
      try {
        const responseData = await response.json();
        
        console.log(`[${sessionId}] [uploadAndTranscribe] Dati risposta:`, {
          tipoRisposta: typeof responseData,
          chiavi: responseData ? Object.keys(responseData).join(', ') : 'nessuna',
          requestId: responseData.requestId || 'nessuno'
        });
        
        const transcription = responseData.result;

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
      
      // Se JSON fallisce, prova a leggere come testo dalla copia clonata
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

  // Per file oltre 2MB, considera l'uso diretto di OpenAI API
  if (file.size > 2 * 1024 * 1024) {
    console.log(`[${sessionId}] File grande rilevato (${(file.size/1024/1024).toFixed(2)}MB). ` + 
                `Tentativo diretto con API OpenAI...`);
                
    try {
      // Tentativo diretto con OpenAI API tramite upload-direct
      console.log(`[${sessionId}] Invio richiesta diretta a OpenAI API...`);
      
      const formData = new FormData();
      formData.append('file', file);
      formData.append('model', 'whisper-1');
      formData.append('language', 'it');
      formData.append('response_format', 'text');
      formData.append('session_id', sessionId);
      // Aggiungi prompt per trascrizione letterale
      formData.append('prompt', 'Trascrivi letteralmente tutto, incluse ripetizioni e false partenze. Non modificare, riassumere o correggere il testo.');
      formData.append('temperature', '0');
      
      const startTime = Date.now();
      
      // Usa una funzione specifica per chiamate dirette a OpenAI
      const response = await fetch('/.netlify/functions/upload-direct', {
        method: 'POST',
        body: formData
      });
      
      const elapsedMs = Date.now() - startTime;
      console.log(`[${sessionId}] Risposta OpenAI ricevuta dopo ${(elapsedMs/1000).toFixed(1)}s:`, {
        status: response.status,
        ok: response.ok,
        statusText: response.statusText
      });
      
      if (response.ok) {
        const responseText = await response.text();
        console.log(`[${sessionId}] Trascrizione completata con API diretta:`, {
          lunghezza: responseText.length,
          preview: responseText.substring(0, 100),
          tempoTotale: `${(elapsedMs/1000).toFixed(1)}s`
        });
        return responseText;
      } else {
        console.warn(`[${sessionId}] API diretta fallita, provo metodo alternative: ${response.statusText}`);
        // Continua con metodo alternativo
      }
    } catch (directError) {
      console.error(`[${sessionId}] Errore con API diretta:`, directError);
      console.log(`[${sessionId}] Fallback al metodo standard...`);
      // Continua con metodo alternativo
    }
  }

  // Strategia di fallback - metodo standard
  const startTime = Date.now();

  try {
    console.log(`[${sessionId}] Utilizzo metodo standard (fallback) per la trascrizione...`);
    
    const formData = new FormData();
    formData.append('file', file);
    formData.append('model', 'whisper-1');
    formData.append('language', 'it');
    formData.append('response_format', 'text');
    formData.append('session_id', sessionId);
    // Aggiungi prompt per trascrizione letterale
    formData.append('prompt', 'Trascrivi letteralmente tutto, incluse ripetizioni e false partenze. Non modificare, riassumere o correggere il testo.');
    formData.append('temperature', '0');
    
    // Per file grandi, usa la funzione transcribe-audio
    // Per file piccoli, usa la funzione upload-transcribe
    const isM4AFile = file.name.toLowerCase().endsWith('.m4a') || file.type.includes('m4a') || file.type.includes('mp4');
    const endpoint = isM4AFile
      ? '/.netlify/functions/upload-direct' // Usa sempre upload-direct per i file m4a
      : (file.size > 3 * 1024 * 1024 && file.size <= 8 * 1024 * 1024
        ? '/.netlify/functions/transcribe-audio'
        : (file.size > 8 * 1024 * 1024 
            ? '/.netlify/functions/upload-direct' 
            : '/.netlify/functions/upload-transcribe'));
    
    console.log(`[${sessionId}] Endpoint selezionato: ${endpoint} per file di ${(file.size/1024/1024).toFixed(2)}MB (${isM4AFile ? 'M4A' : 'non M4A'})`);
    
    // Aggiungi timeout esteso
    const timeoutMs = Math.min(Math.max(file.size / 1024, 30000), 600000); // Min 30s, max 10min
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        body: formData,
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      const elapsedMs = Date.now() - startTime;
      console.log(`[${sessionId}] Risposta ricevuta dopo ${(elapsedMs/1000).toFixed(1)}s:`, {
        status: response.status,
        ok: response.ok,
        statusText: response.statusText
      });
      
      if (!response.ok) {
        throw new Error(`Errore nella risposta: ${response.status} ${response.statusText}`);
      }
      
      // Clona la risposta immediatamente
      const responseClone = response.clone();
      
      // Prova a leggere direttamente come testo
      try {
        const textResponse = await responseClone.text();
        
        if (textResponse) {
          console.log(`[${sessionId}] Trascrizione completata come testo:`, {
            lunghezza: textResponse.length,
            preview: textResponse.substring(0, 100)
          });
          
          // Verifica se il testo è in formato JSON
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
      
      // Se JSON fallisce, prova JSON
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
    const elapsedMs = Date.now() - startTime;
    console.error(`[${sessionId}] Errore durante la trascrizione dopo ${(elapsedMs/1000).toFixed(1)}s:`, error);
    
    // Per errori di timeout o dimensione, suggerisci l'uso di un'applicazione esterna
    if (error.message.includes('timeout') || error.message.includes('timed out') || file.size > 8 * 1024 * 1024) {
      throw new Error(
        `Il file audio è troppo grande per essere elaborato dal server (${(file.size/1024/1024).toFixed(1)}MB). ` +
        `Prova a convertire il file in un formato più efficiente (m4a) o comprimilo a una qualità inferiore (96kbps). ` +
        `Un file di alta qualità non dovrebbe superare i 5-6MB per 15 minuti di audio.`
      );
    }
    
    throw error;
  }
}

// Funzione comune per chiamare l'API di trascrizione
async function callTranscriptionApi(formData: FormData): Promise<string> {
  const sessionId = formData.get('session_id') as string || Math.random().toString(36).substring(2, 10);
  try {
    console.log(`[${sessionId}] [callTranscriptionApi] Chiamata alla funzione di trascrizione...`);
    
    // Verifica se utilizzare Edge Function Supabase o Netlify Function
    const useSupabaseFunction = false; // Imposta a false per usare la funzione Netlify
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