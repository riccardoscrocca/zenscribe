export async function transcribeAudio(audioBlob: Blob): Promise<string> {
  try {
    console.log('[transcribeAudio] Inizio trascrizione...', {
      type: audioBlob.type,
      size: audioBlob.size,
      tipoFile: audioBlob.type || 'sconosciuto'
    });

    // Determina l'estensione del file in base al tipo MIME
    let extension = 'webm';
    let mimeType = audioBlob.type || '';
    
    if (mimeType.includes('mp3') || mimeType.includes('mpeg')) {
      extension = 'mp3';
      console.log('[transcribeAudio] Rilevato file MP3');
    } else if (mimeType.includes('wav')) {
      extension = 'wav';
      console.log('[transcribeAudio] Rilevato file WAV');
    } else if (mimeType.includes('m4a') || mimeType.includes('mp4')) {
      extension = 'm4a';
      console.log('[transcribeAudio] Rilevato file M4A/MP4');
    } else {
      console.log('[transcribeAudio] Tipo di file non riconosciuto, uso default webm');
    }

    console.log('[transcribeAudio] Estensione determinata:', extension);

    // Crea una copia del blob con il tipo MIME corretto se necessario
    let audioFile = audioBlob;
    if (!audioBlob.type || audioBlob.type === 'audio/mp3') {
      // Correggi il MIME type per i file MP3
      audioFile = new Blob([audioBlob], { type: 'audio/mpeg' });
      console.log('[transcribeAudio] Creato nuovo blob con tipo MIME corretto:', audioFile.type);
    }

    // Crea FormData per inviare l'audio alla Netlify Function
    const formData = new FormData();
    const fileName = `recording.${extension}`;
    formData.append('file', audioFile, fileName);
    formData.append('model', 'whisper-1');
    formData.append('language', 'it');
    formData.append('response_format', 'text');
    formData.append('temperature', '0');

    console.log('[transcribeAudio] FormData creato, invio file...', {
      filename: fileName,
      type: audioFile.type,
      keys: [...formData.keys()].join(', ')
    });

    return await callTranscriptionApi(formData);
  } catch (error) {
    console.error('[transcribeAudio] Errore:', error);
    throw error;
  }
}

export async function uploadAndTranscribeFile(file: File): Promise<string> {
  const sessionId = Math.random().toString(36).substring(2, 10);
  console.log(`[${sessionId}] [uploadAndTranscribe] Inizio trascrizione del file...`, {
    name: file.name,
    type: file.type,
    size: file.size
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
    
    // Debug log
    for (const pair of formData.entries()) {
      console.log(`[${sessionId}] [uploadAndTranscribe] FormData entry:`, pair[0], 
        pair[0] === 'file' ? `File: ${file.name}, type: ${file.type}, size: ${file.size}` : pair[1]);
    }

    console.log(`[${sessionId}] [uploadAndTranscribe] FormData creato, invio file...`);

    // Chiamata diretta alla funzione serverless
    console.log(`[${sessionId}] [uploadAndTranscribe] Chiamata alla funzione Netlify...`);
    
    // Aggiungiamo un timeout esteso per file grandi
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 180000); // 3 minuti di timeout
    
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
          const errorData = await response.json();
          console.error(`[${sessionId}] [uploadAndTranscribe] Errore risposta:`, errorData);
          errorMessage = errorData.error || errorData.details || '';
          
          if (errorData.requestId) {
            console.log(`[${sessionId}] [uploadAndTranscribe] ID richiesta server:`, errorData.requestId);
          }
        } catch (e) {
          console.error(`[${sessionId}] [uploadAndTranscribe] Errore nel parsing della risposta:`, e);
          errorMessage = await response.text();
        }
        throw new Error(`Errore trascrizione (${response.status}): ${errorMessage || response.statusText}`);
      }

      console.log(`[${sessionId}] [uploadAndTranscribe] Parsing della risposta...`);
      let responseData: any;
      try {
        responseData = await response.json();
      } catch (e) {
        console.error(`[${sessionId}] [uploadAndTranscribe] Errore nel parsing JSON della risposta:`, e);
        const textResponse = await response.text();
        console.log(`[${sessionId}] [uploadAndTranscribe] Risposta testuale:`, textResponse.substring(0, 100));
        throw new Error('Errore nel parsing della risposta');
      }
      
      console.log(`[${sessionId}] [uploadAndTranscribe] Dati risposta:`, {
        tipoRisposta: typeof responseData,
        chiavi: responseData ? Object.keys(responseData).join(', ') : 'nessuna',
        requestId: responseData.requestId || 'nessuno'
      });
      
      const transcription = responseData.result;

      console.log(`[${sessionId}] [uploadAndTranscribe] Trascrizione completata:`, {
        lunghezza: transcription ? transcription.length : 0,
        anteprima: transcription ? transcription.substring(0, 100) + '...' : 'nessuna trascrizione'
      });

      if (!transcription) {
        throw new Error('Nessuna trascrizione ricevuta dal server');
      }

      return transcription;
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
 */
export async function uploadAndTranscribeFileDedicated(file: File): Promise<string> {
  const sessionId = Math.random().toString(36).substring(2, 10);
  console.log(`[${sessionId}] [uploadDedicated] Inizio trascrizione del file...`, {
    name: file.name,
    type: file.type,
    size: file.size
  });

  // Funzione di retry con backoff esponenziale
  const fetchWithRetry = async (url: string, options: RequestInit, maxRetries = 3) => {
    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          const backoffTime = Math.min(1000 * Math.pow(2, attempt), 8000); // Max 8 secondi
          console.log(`[${sessionId}] [uploadDedicated] Retry ${attempt + 1}/${maxRetries} dopo ${backoffTime}ms`);
          await new Promise(resolve => setTimeout(resolve, backoffTime));
        }
        
        return await fetch(url, options);
      } catch (err: any) {
        lastError = err;
        console.warn(`[${sessionId}] [uploadDedicated] Tentativo ${attempt + 1} fallito:`, err.message);
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
        console.log(`[${sessionId}] [uploadDedicated] Correzione del MIME type per il file MP3`);
        // Crea una nuova copia del file con il MIME type corretto
        const correctedFile = new File([file], file.name, { type: 'audio/mpeg' });
        file = correctedFile;
        mimeType = 'audio/mpeg';
      }
      console.log(`[${sessionId}] [uploadDedicated] Rilevato file MP3 con MIME type:`, mimeType);
    } else if (file.name.toLowerCase().endsWith('.wav') || mimeType.includes('wav')) {
      extension = 'wav';
      console.log(`[${sessionId}] [uploadDedicated] Rilevato file WAV`);
    } else if (file.name.toLowerCase().endsWith('.m4a') || mimeType.includes('m4a') || mimeType.includes('mp4')) {
      extension = 'm4a';
      console.log(`[${sessionId}] [uploadDedicated] Rilevato file M4A/MP4`);
    } else {
      console.log(`[${sessionId}] [uploadDedicated] Tipo di file sconosciuto, uso nome originale:`, file.name);
    }

    // Crea il FormData con il file originale
    const formData = new FormData();
    
    // Importante: usiamo esplicitamente "file" come nome del campo
    formData.append('file', file, file.name);
    formData.append('model', 'whisper-1');
    formData.append('language', 'it');
    formData.append('response_format', 'text');
    formData.append('temperature', '0');
    formData.append('client_id', sessionId);
    
    // Debug log
    console.log(`[${sessionId}] [uploadDedicated] FormData creato, invio file...`);
    
    // Mostra tutte le entries nel FormData
    console.log(`[${sessionId}] [uploadDedicated] FormData entries:`);
    for (const pair of formData.entries()) {
      if (pair[0] === 'file') {
        const fileObj = pair[1] as File;
        console.log(`[${sessionId}] [uploadDedicated] - ${pair[0]}: ${fileObj.name}, tipo: ${fileObj.type}, size: ${fileObj.size}`);
      } else {
        console.log(`[${sessionId}] [uploadDedicated] - ${pair[0]}: ${pair[1]}`);
      }
    }

    // Chiamata alla funzione serverless dedicata
    console.log(`[${sessionId}] [uploadDedicated] Chiamata alla funzione dedicata...`);
    
    // Aggiungiamo un timeout esteso per file grandi
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 300000); // 5 minuti di timeout
    
    try {
      // Usa la funzione serverless dedicata per upload e trascrizione
      console.log(`[${sessionId}] [uploadDedicated] URL chiamata:`, '/.netlify/functions/upload-transcribe');
      
      // Opzioni complete per la richiesta con CORS
      const requestOptions = {
        method: 'POST',
        body: formData,
        signal: controller.signal,
        headers: {
          // Non impostiamo Content-Type perché viene impostato automaticamente dal browser per multipart/form-data
          'X-Client-ID': sessionId,
          'Accept': 'application/json'
        },
        mode: 'cors' as RequestMode,
        credentials: 'same-origin' as RequestCredentials
      };
      
      const response = await fetchWithRetry('/.netlify/functions/upload-transcribe', requestOptions, 3);  // 3 tentativi massimi

      clearTimeout(timeoutId);
      
      console.log(`[${sessionId}] [uploadDedicated] Risposta ricevuta:`, {
        status: response.status,
        ok: response.ok,
        statusText: response.statusText
      });

      if (!response.ok) {
        let errorMessage = '';
        try {
          const errorData = await response.json();
          console.error(`[${sessionId}] [uploadDedicated] Errore risposta:`, errorData);
          errorMessage = errorData.error || errorData.details || '';
          
          if (errorData.requestId) {
            console.log(`[${sessionId}] [uploadDedicated] ID richiesta server:`, errorData.requestId);
          }
        } catch (e) {
          console.error(`[${sessionId}] [uploadDedicated] Errore nel parsing della risposta:`, e);
          errorMessage = await response.text();
        }
        throw new Error(`Errore trascrizione (${response.status}): ${errorMessage || response.statusText}`);
      }

      console.log(`[${sessionId}] [uploadDedicated] Parsing della risposta...`);
      let responseData: any;
      try {
        responseData = await response.json();
      } catch (e) {
        console.error(`[${sessionId}] [uploadDedicated] Errore nel parsing JSON della risposta:`, e);
        const textResponse = await response.text();
        console.log(`[${sessionId}] [uploadDedicated] Risposta testuale:`, textResponse.substring(0, 100));
        throw new Error('Errore nel parsing della risposta');
      }
      
      console.log(`[${sessionId}] [uploadDedicated] Dati risposta:`, {
        tipoRisposta: typeof responseData,
        chiavi: responseData ? Object.keys(responseData).join(', ') : 'nessuna',
        requestId: responseData.requestId || 'nessuno',
        fileInfo: responseData.fileInfo || 'nessuna info'
      });
      
      const transcription = responseData.result;

      console.log(`[${sessionId}] [uploadDedicated] Trascrizione completata:`, {
        lunghezza: transcription ? transcription.length : 0,
        anteprima: transcription ? transcription.substring(0, 100) + '...' : 'nessuna trascrizione'
      });

      if (!transcription) {
        throw new Error('Nessuna trascrizione ricevuta dal server');
      }

      return transcription;
    } catch (error: any) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        throw new Error('La richiesta è scaduta. Il server potrebbe essere sovraccarico o il file potrebbe essere troppo grande.');
      }
      throw error;
    }
  } catch (error) {
    console.error(`[${sessionId}] [uploadDedicated] Errore:`, error);
    throw error;
  }
}

// Funzione comune per chiamare l'API di trascrizione
async function callTranscriptionApi(formData: FormData): Promise<string> {
  try {
    console.log('[callTranscriptionApi] Chiamata alla funzione Netlify...');
    
    const response = await fetch('/.netlify/functions/transcribe-audio', {
      method: 'POST',
      body: formData
    });

    console.log('[callTranscriptionApi] Risposta ricevuta:', {
      status: response.status,
      ok: response.ok,
      statusText: response.statusText
    });

    if (!response.ok) {
      let errorMessage = '';
      try {
        const errorData = await response.json();
        console.error('[callTranscriptionApi] Errore risposta:', errorData);
        errorMessage = errorData.error || errorData.details || '';
      } catch (e) {
        console.error('[callTranscriptionApi] Errore nel parsing della risposta:', e);
        errorMessage = await response.text();
      }
      throw new Error(`Errore trascrizione (${response.status}): ${errorMessage || response.statusText}`);
    }

    console.log('[callTranscriptionApi] Parsing della risposta...');
    let responseData: any;
    try {
      responseData = await response.json();
    } catch (e) {
      console.error('[callTranscriptionApi] Errore nel parsing JSON della risposta:', e);
      const textResponse = await response.text();
      console.log('[callTranscriptionApi] Risposta testuale:', textResponse.substring(0, 100));
      throw new Error('Errore nel parsing della risposta');
    }
    
    console.log('[callTranscriptionApi] Dati risposta:', {
      tipoRisposta: typeof responseData,
      chiavi: responseData ? Object.keys(responseData).join(', ') : 'nessuna'
    });
    
    const transcription = responseData.result;

    console.log('[callTranscriptionApi] Trascrizione completata:', {
      lunghezza: transcription ? transcription.length : 0,
      anteprima: transcription ? transcription.substring(0, 100) + '...' : 'nessuna trascrizione'
    });

    if (!transcription) {
      throw new Error('Nessuna trascrizione ricevuta dal server');
    }

    return transcription;
  } catch (error) {
    console.error('[callTranscriptionApi] Errore durante la chiamata:', error);
    throw error;
  }
}
