export async function transcribeAudio(audioBlob: Blob): Promise<string> {
  try {
    console.log('[transcribeAudio] Inizio trascrizione...', {
      type: audioBlob.type,
      size: audioBlob.size
    });

    // Crea FormData per inviare l'audio alla Netlify Function
    const formData = new FormData();
    formData.append('file', audioBlob, 'recording.webm');
    formData.append('model', 'whisper-1');
    formData.append('language', 'it');
    formData.append('response_format', 'text');
    formData.append('temperature', '0');

    // Chiama la Netlify Function che usa la chiave server-side
    const response = await fetch('/.netlify/functions/transcribe-audio', {
      method: 'POST',
      body: formData
    });

    const responseData = await response.json();

    if (!response.ok) {
      console.error('[transcribeAudio] Errore risposta:', responseData);
      throw new Error(responseData.error || `Errore trascrizione: ${response.status} ${response.statusText}`);
    }

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
