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

    // Crea FormData per inviare l'audio alla Netlify Function
    const formData = new FormData();
    formData.append('file', audioBlob, `recording.${extension}`);
    formData.append('model', 'whisper-1');
    formData.append('language', 'it');
    formData.append('response_format', 'text');
    formData.append('temperature', '0');

    console.log('[transcribeAudio] Invio file...', {
      filename: `recording.${extension}`,
      type: audioBlob.type
    });

    // Chiama la Netlify Function che usa la chiave server-side
    const response = await fetch('/.netlify/functions/transcribe-audio', {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      const responseData = await response.json();
      console.error('[transcribeAudio] Errore risposta:', responseData);
      throw new Error(responseData.error || `Errore trascrizione: ${response.status} ${response.statusText}`);
    }

    const responseData = await response.json();
    const transcription = responseData.result;

    console.log('[transcribeAudio] Trascrizione completata:', {
      anteprima: transcription.substring(0, 100) + '...'
    });

    return transcription;
  } catch (error) {
    console.error('[transcribeAudio] Errore:', error);
    throw error;
  }
}
