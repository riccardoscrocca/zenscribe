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
  try {
    console.log('[uploadAndTranscribe] Inizio trascrizione del file...', {
      name: file.name,
      type: file.type,
      size: file.size
    });

    // Determina l'estensione del file in base al tipo MIME o al nome
    let extension = 'webm';
    let mimeType = file.type || '';
    
    if (file.name.toLowerCase().endsWith('.mp3') || mimeType.includes('mp3') || mimeType.includes('mpeg')) {
      extension = 'mp3';
      console.log('[uploadAndTranscribe] Rilevato file MP3');
    } else if (file.name.toLowerCase().endsWith('.wav') || mimeType.includes('wav')) {
      extension = 'wav';
      console.log('[uploadAndTranscribe] Rilevato file WAV');
    } else if (file.name.toLowerCase().endsWith('.m4a') || mimeType.includes('m4a') || mimeType.includes('mp4')) {
      extension = 'm4a';
      console.log('[uploadAndTranscribe] Rilevato file M4A/MP4');
    } else {
      console.log('[uploadAndTranscribe] Tipo di file sconosciuto, uso nome originale:', file.name);
    }

    // Crea il FormData con il file originale
    const formData = new FormData();
    formData.append('file', file, file.name);
    formData.append('model', 'whisper-1');
    formData.append('language', 'it');
    formData.append('response_format', 'text');
    formData.append('temperature', '0');

    console.log('[uploadAndTranscribe] FormData creato, invio file...', {
      filename: file.name,
      type: file.type,
      keys: [...formData.keys()].join(', ')
    });

    return await callTranscriptionApi(formData);
  } catch (error) {
    console.error('[uploadAndTranscribe] Errore:', error);
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
