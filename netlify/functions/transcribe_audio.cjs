const fetch = require('node-fetch');
const FormData = require('form-data');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');

// Funzione di logging migliorata
function logDebug(message, data) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${message}`, data || '');
}

// Funzione per gestire la risposta di errore
function errorResponse(message, statusCode = 500, requestId) {
  return {
    statusCode: statusCode,
    body: JSON.stringify({
      error: message,
      requestId: requestId
    })
  };
}

// Handler principale
exports.handler = async (event) => {
  // Genera un ID univoco per questa richiesta
  const requestId = uuidv4().substring(0, 8);
  
  // Log di inizio richiesta
  logDebug(`Richiesta ricevuta ${requestId}`, {
    method: event.httpMethod,
    path: event.path,
    contentType: event.headers['content-type']
  });
  
  // Verifica metodo HTTP
  if (event.httpMethod !== 'POST') {
    return errorResponse('Method not allowed', 405, requestId);
  }

  try {
    logDebug(`Inizio elaborazione richiesta ${requestId}`);
    
    // Verifica del content type
    const contentType = event.headers['content-type'] || '';
    if (!contentType.includes('multipart/form-data')) {
      return errorResponse('Content-Type must be multipart/form-data', 400, requestId);
    }
    
    // Analisi dei limiti per il multipart
    const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
    if (!boundaryMatch) {
      return errorResponse('Invalid Content-Type: no multipart boundary', 400, requestId);
    }
    
    const boundary = boundaryMatch[1] || boundaryMatch[2];
    logDebug(`Boundary trovato ${requestId}`, boundary);

    // Verifica che la API key OpenAI sia configurata
    const apiKey = process.env.OPENAI_SECRET_KEY;
    if (!apiKey) {
      logDebug(`API key OpenAI non trovata ${requestId}`);
      return errorResponse('OpenAI API key not configured', 500, requestId);
    }
    
    // Prepara il form data per OpenAI
    const form = new FormData();
    
    // Estrazione del file audio dal body
    const bufferData = Buffer.from(event.body, 'base64');
    logDebug(`Dati ricevuti ${requestId}`, {
      bodyLength: bufferData.length,
      bytesRicevuti: bufferData.length
    });
    
    // Gestisci il multipart/form-data manualmente
    // Trova i marker di inizio e fine del file
    const bodyText = bufferData.toString('utf8');
    const fileMarker = `Content-Disposition: form-data; name="file"`;
    const fileStart = bodyText.indexOf(fileMarker);
    
    if (fileStart === -1) {
      logDebug(`Nessun file trovato nel form data ${requestId}`);
      return errorResponse('No file found in form data', 400, requestId);
    }
    
    // Trova la linea vuota che segna l'inizio dei dati binari
    const headerEndPosition = bodyText.indexOf('\r\n\r\n', fileStart);
    if (headerEndPosition === -1) {
      return errorResponse('Invalid form data format', 400, requestId);
    }

    // Estrai le intestazioni del file
    const fileHeaders = bodyText.substring(fileStart, headerEndPosition);
    logDebug(`Intestazioni file ${requestId}`, fileHeaders);
    
    // Cerca il nome del file
    const filenameMatch = fileHeaders.match(/filename="([^"]+)"/i);
    const fileName = filenameMatch ? filenameMatch[1] : 'audio.webm';
    
    // Cerca il tipo di contenuto
    const contentTypeMatch = fileHeaders.match(/Content-Type: ([^\r\n]+)/i);
    const fileMimeType = contentTypeMatch ? contentTypeMatch[1].trim() : 'audio/webm';
    
    logDebug(`Dettagli file ${requestId}`, {
      nome: fileName,
      tipo: fileMimeType
    });
    
    // Trova il prossimo boundary che segna la fine dei dati binari
    const dataStart = headerEndPosition + 4; // Salta \r\n\r\n
    const boundaryEnd = `--${boundary}--`;
    const boundaryNext = `--${boundary}`;
    
    let dataEnd = bodyText.indexOf(boundaryNext, dataStart);
    if (dataEnd === -1) {
      dataEnd = bodyText.length;
    }
    
    // Estrai i dati binari
    const audioBuffer = bufferData.slice(dataStart, dataEnd - 2); // Rimuovi \r\n finale
    
    logDebug(`Dati audio estratti ${requestId}`, {
      size: audioBuffer.length,
      start: dataStart,
      end: dataEnd
    });
    
    // Determina il tipo di contenuto per OpenAI
    let contentTypeForOpenAI = 'audio/webm';
    let extension = 'webm';
    
    if (fileMimeType.includes('mp3') || fileMimeType.includes('mpeg') || fileName.toLowerCase().endsWith('.mp3')) {
      contentTypeForOpenAI = 'audio/mpeg';
      extension = 'mp3';
      logDebug(`Formato MP3 rilevato ${requestId}`);
    } else if (fileMimeType.includes('wav') || fileName.toLowerCase().endsWith('.wav')) {
      contentTypeForOpenAI = 'audio/wav';
      extension = 'wav';
      logDebug(`Formato WAV rilevato ${requestId}`);
    } else if (fileMimeType.includes('m4a') || fileMimeType.includes('mp4') || fileName.toLowerCase().endsWith('.m4a')) {
      contentTypeForOpenAI = 'audio/mp4';
      extension = 'm4a';
      logDebug(`Formato M4A rilevato ${requestId}`);
    } else {
      logDebug(`Formato generico, uso WebM come default ${requestId}`);
    }
    
    logDebug(`Tipo di contenuto determinato ${requestId}`, { contentTypeForOpenAI, extension });
    
    // Aggiungo un checksum rapido per verificare l'integrità del file
    const fileHash = crypto
      .createHash('md5')
      .update(audioBuffer)
      .digest('hex')
      .substring(0, 8);
    
    logDebug(`File checksum (MD5) ${requestId}: ${fileHash}`);
    
    // Crea il form data per l'API di OpenAI
    form.append('file', audioBuffer, {
      filename: `audio_${fileHash}.${extension}`,
      contentType: contentTypeForOpenAI
    });
    form.append('model', 'whisper-1');
    form.append('language', 'it');
    form.append('response_format', 'text');
    form.append('temperature', '0');

    // Log dettagliati per il debugging
    logDebug(`FormData preparato per OpenAI ${requestId}`, {
      model: 'whisper-1',
      language: 'it',
      responseFormat: 'text',
      temperature: '0',
      fileSize: audioBuffer.length,
      fileName: `audio_${fileHash}.${extension}`,
      contentType: contentTypeForOpenAI
    });

    // Chiamata all'API di OpenAI
    logDebug(`Invio richiesta a OpenAI API ${requestId}`);
    
    const response = await axios({
      method: 'post',
      url: 'https://api.openai.com/v1/audio/transcriptions',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        ...form.getHeaders()
      },
      data: form,
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
      timeout: 300000 // 5 minuti di timeout
    });
    
    // Log di risposta
    logDebug(`Risposta ricevuta da OpenAI ${requestId}`, {
      status: response.status,
      contentType: response.headers['content-type']
    });
    
    // Elabora la risposta
    const transcriptionData = response.data;
    
    // Se response_format=text, ritorna direttamente come testo
    const responseContentType = response.headers['content-type'] || '';
    if (responseContentType.includes('text/plain')) {
      logDebug(`Trascrizione completata (testo) ${requestId}`, {
        lunghezza: typeof transcriptionData === 'string' ? transcriptionData.length : 'non è stringa'
      });
      
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'text/plain'
        },
        body: transcriptionData
      };
    }
    
    // Se json o altro formato, incapsula in un oggetto
    logDebug(`Trascrizione completata (json) ${requestId}`, {
      tipo: typeof transcriptionData
    });
    
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        result: transcriptionData,
        requestId: requestId
      })
    };
  } catch (error) {
    // Gestione errori migliorata
    logDebug(`Errore durante la trascrizione ${requestId}`, {
      message: error.message,
      stack: error.stack,
      response: error.response ? {
        status: error.response.status,
        data: error.response.data
      } : 'no response'
    });
    
    // Se c'è una risposta dall'API, include i dettagli
    if (error.response) {
      return {
        statusCode: error.response.status,
        body: JSON.stringify({
          error: 'OpenAI API Error',
          details: error.response.data,
          status: error.response.status,
          requestId: requestId
        })
      };
    }
    
    // Errore generico
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Server Error',
        message: error.message,
        requestId: requestId
      })
    };
  }
}; 