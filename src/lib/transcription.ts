export async function transcribeAudio(audioBlob: Blob): Promise<string> {
  try {
    console.log('[transcribeAudio] Inizio trascrizione...', {
      type: audioBlob.type,
      size: audioBlob.size
    });

    // Determina l'estensione del file in base al tipo MIME
    let extension = 'webm';
    if (audioBlob.type.includes('mp3')) {
      extension = 'mp3';
    } else if (audioBlob.type.includes('wav')) {
      extension = 'wav';
    } else if (audioBlob.type.includes('m4a')) {
      extension = 'm4a';
    }

    console.log('[transcribeAudio] Estensione determinata:', extension);

    // Crea FormData per inviare l'audio alla Netlify Function
    const formData = new FormData();
    formData.append('file', audioBlob, `recording.${extension}`);
    formData.append('model', 'whisper-1');
    formData.append('language', 'it');
    formData.append('response_format', 'text');
    formData.append('temperature', '0');

    console.log('[transcribeAudio] FormData creato, invio file...', {
      filename: `recording.${extension}`,
      type: audioBlob.type,
      keys: [...formData.keys()].join(', ')
    });

    // Chiama la Netlify Function che usa la chiave server-side
    console.log('[transcribeAudio] Chiamata alla funzione Netlify...');
    const response = await fetch('/.netlify/functions/transcribe-audio', {
      method: 'POST',
      body: formData
    });

    console.log('[transcribeAudio] Risposta ricevuta:', {
      status: response.status,
      ok: response.ok,
      statusText: response.statusText
    });

    if (!response.ok) {
      const responseData = await response.json();
      console.error('[transcribeAudio] Errore risposta:', responseData);
      throw new Error(responseData.error || `Errore trascrizione: ${response.status} ${response.statusText}`);
    }

    const responseData = await response.json();
    console.log('[transcribeAudio] Dati risposta:', {
      tipoRisposta: typeof responseData,
      chiavi: responseData ? Object.keys(responseData).join(', ') : 'nessuna'
    });
    
    const transcription = responseData.result;

    console.log('[transcribeAudio] Trascrizione completata:', {
      lunghezza: transcription ? transcription.length : 0,
      anteprima: transcription ? transcription.substring(0, 100) + '...' : 'nessuna trascrizione'
    });

    return transcription;
  } catch (error) {
    console.error('[transcribeAudio] Errore:', error);
    throw error;
  }
}
