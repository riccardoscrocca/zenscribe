import { Handler } from '@netlify/functions';
import fetch from 'node-fetch';
import Busboy from 'busboy';
import { Readable } from 'stream';
import FormData from 'form-data';
import * as crypto from 'crypto';

// Funzione di log avanzata per il debugging
const logDebug = (label: string, data?: any) => {
  const timestamp = new Date().toISOString();
  const logPrefix = `[${timestamp}] [TRANSCRIBE-AUDIO]`;
  
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
  const requestId = crypto.randomBytes(4).toString('hex');
  logDebug(`Inizio richiesta ${requestId}`);
  
  try {
    // Logging iniziale per ogni richiesta
    logDebug(`Headers richiesta ${requestId}`, event.headers);
    logDebug(`Metodo richiesta ${requestId}`, event.httpMethod);
    logDebug(`Dimensione body ${requestId}`, event.body ? Buffer.from(event.body, 'base64').length : 0);

    if (event.httpMethod !== 'POST') {
      logDebug(`Metodo non consentito ${requestId}`, event.httpMethod);
      return {
        statusCode: 405,
        body: JSON.stringify({ error: 'Method Not Allowed' }),
      };
    }

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
          details: 'The API key should start with sk-'
        }),
      };
    }

    // Verifica che ci siano i dati e il content-type
    if (!event.body) {
      logDebug(`Nessun body trovato nella richiesta ${requestId}`);
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'No request body provided' }),
      };
    }

    if (!event.headers['content-type']) {
      logDebug(`Nessun content-type trovato nella richiesta ${requestId}`);
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'No content-type header provided' }),
      };
    }

    logDebug(`Content-type richiesta ${requestId}`, event.headers['content-type']);

    // Funzione per parsare il multipart form data
    const parseFormData = () => {
      return new Promise<{ buffer: Buffer; mimeType: string; fileName: string }>((resolve, reject) => {
        let fileBuffer: Buffer | null = null;
        let fileMimeType = '';
        let fileName = '';
        
        // Configurazione di Busboy con impostazioni più permissive
        logDebug(`Inizializzazione Busboy ${requestId}`, { 
          contentType: event.headers['content-type'] 
        });
        
        const busboy = Busboy({ 
          headers: { 'content-type': event.headers['content-type'] || '' },
          limits: {
            fileSize: 200 * 1024 * 1024, // 200MB (aumentato da 100MB)
            files: 1
          }
        });

        busboy.on('file', (fieldname, file, info) => {
          fileName = info.filename || '';
          fileMimeType = info.mimeType || '';
          
          logDebug(`Processamento file iniziato ${requestId}`, { 
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
              logDebug(`Progresso ricezione file ${requestId}`, {
                chunks: chunks.length,
                bytesRicevuti: chunks.reduce((acc, chunk) => acc + chunk.length, 0)
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
              sizeMB: (fileBuffer.length / (1024 * 1024)).toFixed(2)
            });
          });
        });

        busboy.on('field', (fieldname, value) => {
          logDebug(`Campo form ricevuto ${requestId}`, { fieldname, value });
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
          
          if (!fileMimeType || fileMimeType === 'application/octet-stream') {
            // Se non abbiamo un MIME type valido, proviamo a determinarlo dal nome del file
            if (fileName.toLowerCase().endsWith('.mp3')) {
              logDebug(`File MP3 rilevato dal nome file ${requestId}`, fileName);
              fileMimeType = 'audio/mpeg';
            } else if (fileName.toLowerCase().endsWith('.wav')) {
              logDebug(`File WAV rilevato dal nome file ${requestId}`, fileName);
              fileMimeType = 'audio/wav';
            } else if (fileName.toLowerCase().endsWith('.m4a')) {
              logDebug(`File M4A rilevato dal nome file ${requestId}`, fileName);
              fileMimeType = 'audio/mp4';
            } else if (fileName.toLowerCase().endsWith('.webm')) {
              logDebug(`File WebM rilevato dal nome file ${requestId}`, fileName);
              fileMimeType = 'audio/webm';
            }
          }
          
          logDebug(`Busboy processing completato ${requestId}`);
          resolve({ buffer: fileBuffer, mimeType: fileMimeType, fileName });
        });

        busboy.on('error', (error) => {
          logDebug(`Errore Busboy ${requestId}`, error);
          reject(error);
        });

        if (event.body) {
          try {
            const buffer = Buffer.from(event.body, 'base64');
            logDebug(`Dimensione body decodificato ${requestId}`, buffer.length);
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
    const { buffer: audioBuffer, mimeType: fileMimeType, fileName } = await parseFormData();
    logDebug(`Form data parsed successfully ${requestId}`, { 
      audioSize: audioBuffer.length, 
      mimeType: fileMimeType,
      fileName
    });

    // Prepara il form data per OpenAI
    const formData = new FormData();
    
    // Determina il content type e l'estensione del file in base al tipo MIME o al nome del file
    let contentType = 'audio/webm';
    let extension = 'webm';
    
    if (fileMimeType.includes('mp3') || fileMimeType.includes('mpeg') || fileName.toLowerCase().endsWith('.mp3')) {
      contentType = 'audio/mpeg';
      extension = 'mp3';
      logDebug(`Formato MP3 rilevato ${requestId}`);
    } else if (fileMimeType.includes('wav') || fileName.toLowerCase().endsWith('.wav')) {
      contentType = 'audio/wav';
      extension = 'wav';
      logDebug(`Formato WAV rilevato ${requestId}`);
    } else if (fileMimeType.includes('m4a') || fileMimeType.includes('mp4') || fileName.toLowerCase().endsWith('.m4a')) {
      contentType = 'audio/mp4';
      extension = 'm4a';
      logDebug(`Formato M4A rilevato ${requestId}`);
    } else {
      logDebug(`Formato generico, uso WebM come default ${requestId}`);
    }
    
    logDebug(`Tipo di contenuto determinato ${requestId}`, { contentType, extension });
    
    // Aggiungo un checksum rapido per verificare l'integrità del file
    const fileHash = crypto
      .createHash('md5')
      .update(audioBuffer)
      .digest('hex')
      .substring(0, 8);
    
    logDebug(`File checksum (MD5) ${requestId}`, fileHash);
    
    formData.append('file', audioBuffer, {
      filename: `audio_${fileHash}.${extension}`,
      contentType: contentType
    });
    formData.append('model', 'whisper-1');
    formData.append('language', 'it');
    formData.append('response_format', 'text');
    formData.append('temperature', '0');

    // Log dettagliati per il debugging
    logDebug(`FormData preparato per OpenAI ${requestId}`, {
      model: 'whisper-1',
      language: 'it',
      responseFormat: 'text',
      temperature: '0',
      fileSize: audioBuffer.length,
      fileName: `audio_${fileHash}.${extension}`,
      contentType
    });

    // Aumenta il timeout per la chiamata a OpenAI
    const timeoutPromise = new Promise<Response | null>((_, reject) => {
      setTimeout(() => reject(new Error('Timeout durante la richiesta a OpenAI')), 300000); // 5 minuti
    });

    logDebug(`Invio richiesta a OpenAI API ${requestId}`);

    try {
      // Chiamata a OpenAI con race per il timeout
      const openaiResponse = await Promise.race([
        fetch('https://api.openai.com/v1/audio/transcriptions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey.trim()}`, // Rimuoviamo eventuali spazi
            ...formData.getHeaders()
          },
          // @ts-ignore - form-data è compatibile con node-fetch
          body: formData
        }),
        timeoutPromise
      ]);

      // Se la risposta è null, il timeout ha vinto la race
      if (!openaiResponse) {
        throw new Error('Timeout durante la richiesta a OpenAI');
      }

      logDebug(`Risposta OpenAI ricevuta ${requestId}`, {
        status: openaiResponse.status,
        statusText: openaiResponse.statusText,
        headers: Object.fromEntries(openaiResponse.headers.entries())
      });
      
      if (!openaiResponse.ok) {
        const error = await openaiResponse.text();
        logDebug(`Errore API OpenAI ${requestId}`, error);
        
        // Tenta di parsare l'errore JSON da OpenAI
        let errorDetails = error;
        try {
          const errorJson = JSON.parse(error);
          errorDetails = errorJson.error?.message || error;
          logDebug(`Dettagli errore parsati ${requestId}`, errorJson);
        } catch (e) {
          logDebug(`Impossibile parsare l'errore come JSON ${requestId}`);
          // Ignora se non è JSON
        }
        
        return {
          statusCode: openaiResponse.status,
          body: JSON.stringify({ 
            error: 'OpenAI API Error',
            details: errorDetails,
            status: openaiResponse.status,
            requestId
          }),
        };
      }

      const result = await openaiResponse.text();
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
        body: JSON.stringify({ result, requestId }),
      };
    } catch (fetchError) {
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