import { Handler } from '@netlify/functions';
import fetch from 'node-fetch';
import Busboy from 'busboy';
import { Readable } from 'stream';
import FormData from 'form-data';
import * as crypto from 'crypto';

// Funzione di log avanzata per il debugging
const logDebug = (label: string, data?: any) => {
  const timestamp = new Date().toISOString();
  const logPrefix = `[${timestamp}] [UPLOAD-TRANSCRIBE]`;
  
  if (data) {
    try {
      // Cerchiamo di fare un JSON.stringify sicuro
      const safeData = typeof data === 'object' ? 
        JSON.stringify(data, (key, value) => {
          // Evitiamo di loggare buffer troppo grandi
          if (Buffer.isBuffer(value)) return `Buffer(${value.length} bytes)`;
          if (key === 'buffer') return `Buffer(size: ${value?.length || 'unknown'} bytes)`;
          return value;
        }) : 
        String(data);
      
      console.log(`${logPrefix} ${label}:`, safeData);
    } catch (err) {
      console.log(`${logPrefix} ${label}: [Dati non serializzabili]`, typeof data);
    }
  } else {
    console.log(`${logPrefix} ${label}`);
  }
};

export const handler: Handler = async (event) => {
  // Genera un ID univoco per la richiesta per correlazione nei log
  const requestId = crypto.randomBytes(4).toString('hex');
  logDebug(`Inizio richiesta ${requestId}`);
  
  // Gestisci le richieste OPTIONS (preflight CORS)
  if (event.httpMethod === 'OPTIONS') {
    logDebug(`Richiesta OPTIONS ricevuta ${requestId}`);
    return {
      statusCode: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Max-Age': '86400'
      },
      body: ''
    };
  }
  
  try {
    // Log iniziali per ogni richiesta
    logDebug(`Headers richiesta ${requestId}`, event.headers);
    logDebug(`Metodo richiesta ${requestId}`, event.httpMethod);
    
    if (event.httpMethod !== 'POST') {
      logDebug(`Metodo non consentito ${requestId}: ${event.httpMethod}`);
      return {
        statusCode: 405,
        body: JSON.stringify({ error: 'Method Not Allowed', requestId }),
      };
    }

    // Verifica la chiave API di OpenAI
    const apiKey = process.env.OPENAI_API_KEY || process.env.VITE_OPENAI_API_KEY;
    logDebug(`Verifica API key ${requestId}`, {
      present: !!apiKey,
      length: apiKey?.length,
      startsWithSk: apiKey?.startsWith('sk-'),
      firstChars: apiKey?.substring(0, 5),
      lastChars: apiKey?.substring(apiKey?.length - 4)
    });

    if (!apiKey || !apiKey.startsWith('sk-')) {
      logDebug(`Chiave API OpenAI non valida ${requestId}`);
      return {
        statusCode: 500,
        body: JSON.stringify({ 
          error: 'Invalid OpenAI API key format',
          details: 'The API key should start with sk-',
          requestId
        }),
      };
    }

    // Verifica che ci siano i dati e il content-type
    if (!event.body) {
      logDebug(`Nessun body trovato nella richiesta ${requestId}`);
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'No request body provided', requestId }),
      };
    }

    if (!event.headers['content-type']) {
      logDebug(`Nessun content-type trovato nella richiesta ${requestId}`);
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'No content-type header provided', requestId }),
      };
    }

    // Verifica che il content-type sia multipart/form-data
    const contentType = event.headers['content-type'];
    if (!contentType.includes('multipart/form-data')) {
      logDebug(`Content-type non valido ${requestId}: ${contentType}`);
      return {
        statusCode: 400, 
        body: JSON.stringify({ 
          error: 'Invalid content type', 
          details: 'Content-type must be multipart/form-data',
          requestId
        })
      };
    }

    logDebug(`Elaborazione richiesta con content-type ${requestId}: ${contentType}`);

    // Funzione per parsare il multipart form data
    const parseFormData = () => {
      return new Promise<{ buffer: Buffer; mimeType: string; fileName: string; clientId?: string }>((resolve, reject) => {
        let fileBuffer: Buffer | null = null;
        let fileMimeType = '';
        let fileName = '';
        let clientId = '';
        
        // Configurazione di Busboy con impostazioni più permissive
        logDebug(`Inizializzazione Busboy ${requestId}`, { contentType });
        
        const busboy = Busboy({ 
          headers: { 'content-type': contentType },
          limits: {
            fileSize: 100 * 1024 * 1024, // 100MB
            files: 1
          }
        });

        busboy.on('file', (fieldname, file, info) => {
          fileName = info.filename || '';
          fileMimeType = info.mimeType || '';
          
          logDebug(`File ricevuto ${requestId}`, { 
            fieldname, 
            filename: fileName, 
            encoding: info.encoding, 
            mimeType: fileMimeType 
          });
          
          const chunks: Buffer[] = [];

          file.on('data', (data) => {
            chunks.push(data);
            // Log per monitorare il progresso
            if (chunks.length % 10 === 0) {
              const bytesReceived = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
              logDebug(`Progresso ricezione file ${requestId}`, {
                chunks: chunks.length,
                bytesRicevuti: bytesReceived,
                bytesRicevutiMB: (bytesReceived / (1024 * 1024)).toFixed(2) + ' MB'
              });
            }
          });

          file.on('limit', () => {
            logDebug(`Dimensione file superata ${requestId}`);
            reject(new Error('File size limit exceeded'));
          });

          file.on('end', () => {
            fileBuffer = Buffer.concat(chunks);
            logDebug(`File processato completamente ${requestId}`, { 
              fileName,
              size: fileBuffer.length, 
              mimeType: fileMimeType,
              sizeKB: Math.round(fileBuffer.length / 1024),
              sizeMB: (fileBuffer.length / (1024 * 1024)).toFixed(2) + ' MB'
            });
          });
        });

        busboy.on('field', (fieldname, value) => {
          logDebug(`Campo form ricevuto ${requestId}`, { fieldname, value });
          // Salviamo l'ID client se presente
          if (fieldname === 'session_id' || fieldname === 'client_id') {
            clientId = value;
            logDebug(`ID client ricevuto ${requestId}: ${clientId}`);
          }
        });

        busboy.on('finish', () => {
          if (!fileBuffer) {
            logDebug(`Nessun file trovato nei dati form ${requestId}`);
            reject(new Error('No file found in form data'));
            return;
          }
          
          // Verifica del tipo di file in base al nome o al MIME type
          logDebug(`Verifica tipo file ${requestId}`, {
            mimeType: fileMimeType,
            fileName
          });
          
          // Rilevamento tipo file
          if (!fileMimeType || fileMimeType === 'application/octet-stream') {
            // Se non abbiamo un MIME type valido, proviamo a determinarlo dal nome del file
            if (fileName.toLowerCase().endsWith('.mp3')) {
              logDebug(`File MP3 rilevato dal nome file ${requestId}: ${fileName}`);
              fileMimeType = 'audio/mpeg';
            } else if (fileName.toLowerCase().endsWith('.wav')) {
              logDebug(`File WAV rilevato dal nome file ${requestId}: ${fileName}`);
              fileMimeType = 'audio/wav';
            } else if (fileName.toLowerCase().endsWith('.m4a')) {
              logDebug(`File M4A rilevato dal nome file ${requestId}: ${fileName}`);
              fileMimeType = 'audio/mp4';
            } else if (fileName.toLowerCase().endsWith('.webm')) {
              logDebug(`File WebM rilevato dal nome file ${requestId}: ${fileName}`);
              fileMimeType = 'audio/webm';
            }
          }
          
          logDebug(`Busboy processing completato ${requestId}`);
          resolve({ buffer: fileBuffer, mimeType: fileMimeType, fileName, clientId });
        });

        busboy.on('error', (error) => {
          logDebug(`Errore Busboy ${requestId}`, error);
          reject(error);
        });

        if (event.body) {
          try {
            const buffer = Buffer.from(event.body, 'base64');
            logDebug(`Dimensione body decodificato ${requestId}: ${buffer.length} bytes`);
            const stream = Readable.from(buffer);
            logDebug(`Stream creato, piping a Busboy ${requestId}`);
            stream.pipe(busboy);
          } catch (error) {
            logDebug(`Errore nella decodifica del body ${requestId}`, error);
            reject(error);
          }
        } else {
          logDebug(`Body non fornito nella richiesta ${requestId}`);
          reject(new Error('No body provided'));
        }
      });
    };

    // Ottieni il file audio dal form data
    logDebug(`Inizio parsing form data ${requestId}`);
    const { buffer: audioBuffer, mimeType: fileMimeType, fileName, clientId } = await parseFormData();
    logDebug(`Form data processed successfully ${requestId}`, { 
      audioSize: audioBuffer.length, 
      mimeType: fileMimeType,
      fileName,
      clientId: clientId || 'non specificato'
    });

    // Prepara il form data per OpenAI
    const form = new FormData();
    
    // Determina il content type e l'estensione del file
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
    try {
      const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey.trim()}`,
          ...form.getHeaders()
        },
        // @ts-ignore - form-data è compatibile con node-fetch
        body: form
      });

      logDebug(`Risposta OpenAI ricevuta ${requestId}`, {
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries())
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        logDebug(`Errore API OpenAI ${requestId}`, errorText);
        
        // Tenta di parsare l'errore JSON da OpenAI
        let errorDetails = errorText;
        try {
          const errorJson = JSON.parse(errorText);
          errorDetails = errorJson.error?.message || errorText;
          logDebug(`Dettagli errore parsati ${requestId}`, errorJson);
        } catch (e) {
          logDebug(`Impossibile parsare l'errore come JSON ${requestId}`);
        }
        
        return {
          statusCode: response.status,
          body: JSON.stringify({ 
            error: 'OpenAI API Error',
            details: errorDetails,
            status: response.status,
            requestId
          }),
        };
      }

      // Leggi la risposta e restituisci la trascrizione
      const result = await response.text();
      logDebug(`Trascrizione completata con successo ${requestId}`, {
        length: result.length,
        preview: result.substring(0, 100) + (result.length > 100 ? '...' : '')
      });
      
      logDebug(`Fine elaborazione richiesta ${requestId}`);
      
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          result, 
          requestId,
          clientId: clientId || null,
          fileInfo: {
            type: contentTypeForOpenAI,
            extension,
            size: audioBuffer.length,
            hash: fileHash
          }
        }),
      };
    } catch (fetchError: any) {
      logDebug(`Errore durante la chiamata API OpenAI ${requestId}`, fetchError);
      return {
        statusCode: 500,
        body: JSON.stringify({
          error: 'OpenAI API Error',
          message: fetchError.message,
          requestId
        }),
      };
    }
  } catch (err: any) {
    logDebug(`Errore generale nella funzione ${requestId}`, err);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Server Error',
        message: err.message,
        stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
        requestId
      }),
    };
  }
}; 