import { Handler } from '@netlify/functions';
import fetch from 'node-fetch';
import { FormData, File } from 'formdata-node';
import { fileFromPath } from 'formdata-node/file-from-path';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import busboy from 'busboy';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_ENDPOINT = 'https://api.openai.com/v1/audio/transcriptions';

/**
 * Converte uno stream in un file temporaneo
 */
async function streamToTempFile(stream: Readable): Promise<string> {
  const tempDir = os.tmpdir();
  const tempFilePath = path.join(tempDir, `audio-${uuidv4()}.mp3`);
  const writeStream = fs.createWriteStream(tempFilePath);
  
  try {
    await pipeline(stream, writeStream);
    return tempFilePath;
  } catch (error) {
    // Cleanup in caso di errore
    try {
      if (fs.existsSync(tempFilePath)) {
        fs.unlinkSync(tempFilePath);
      }
    } catch (cleanupError) {
      console.error('Errore nel cleanup file temporaneo:', cleanupError);
    }
    throw error;
  }
}

const handler: Handler = async (event, context) => {
  // Verifica che sia una richiesta POST
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Metodo non supportato' })
    };
  }
  
  // Verifica la presenza dell'API key
  if (!OPENAI_API_KEY) {
    console.error('API key non configurata');
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'API key non configurata' })
    };
  }
  
  const sessionId = uuidv4().substring(0, 8);
  console.log(`[${sessionId}] Nuova richiesta upload-direct`);
  
  try {
    const contentType = event.headers['content-type'] || '';
    
    if (!contentType.includes('multipart/form-data')) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Content-Type non valido. Richiesto multipart/form-data' })
      };
    }
    
    // Usa busboy per parsare il form multipart
    const bb = busboy({ 
      headers: event.headers as any,
      limits: {
        fileSize: 50 * 1024 * 1024, // 50MB max
        files: 1
      }
    });
    let audioFilePath: string | null = null;
    const formData: Record<string, any> = {};
    
    // Processa i form fields
    const formPromise = new Promise<void>((resolve, reject) => {
      bb.on('field', (name, val) => {
        formData[name] = val;
      });
      
      bb.on('file', async (name, file, info) => {
        if (name === 'file') {
          try {
            console.log(`[${sessionId}] Ricevuto file: ${info.filename}, type: ${info.mimeType}, encoding: ${info.encoding}`);
            audioFilePath = await streamToTempFile(file);
            console.log(`[${sessionId}] File salvato temporaneamente in: ${audioFilePath}`);
            
            // Ottieni la dimensione del file per diagnostica
            const stats = fs.statSync(audioFilePath);
            console.log(`[${sessionId}] Dimensione file: ${stats.size} bytes (${(stats.size/1024/1024).toFixed(2)} MB)`);
          } catch (fileError) {
            console.error(`[${sessionId}] Errore processamento file:`, fileError);
            reject(fileError);
          }
        }
      });
      
      bb.on('limit', () => {
        console.error(`[${sessionId}] Dimensione file superata`);
        reject(new Error('File troppo grande. Limite: 50MB'));
      });
      
      bb.on('close', () => {
        console.log(`[${sessionId}] Parsing form completato`);
        resolve();
      });
      
      bb.on('error', (error) => {
        console.error(`[${sessionId}] Errore parsing form:`, error);
        reject(error);
      });
    });
    
    // Passa l'evento a busboy
    if (event.body && event.isBase64Encoded) {
      const buffer = Buffer.from(event.body, 'base64');
      console.log(`[${sessionId}] Dimensione body decodificato: ${buffer.length} bytes`);
      const stream = new Readable();
      stream.push(buffer);
      stream.push(null);
      stream.pipe(bb);
    } else if (event.body) {
      console.log(`[${sessionId}] Usando body come stringa`);
      const stream = new Readable();
      stream.push(event.body);
      stream.push(null);
      stream.pipe(bb);
    } else {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Body mancante' })
      };
    }
    
    // Aspetta che busboy finisca di processare
    await formPromise;
    
    if (!audioFilePath) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'File audio mancante nella richiesta' })
      };
    }
    
    console.log(`[${sessionId}] Parametri di trascrizione:`, {
      model: formData.model || 'whisper-1',
      language: formData.language || 'it',
      response_format: formData.response_format || 'text'
    });
    
    // Crea un nuovo FormData per la richiesta a OpenAI
    const openaiFormData = new FormData();
    
    try {
      const fileBlob = await fileFromPath(audioFilePath);
      openaiFormData.append('file', fileBlob);
    } catch (fileError) {
      console.error(`[${sessionId}] Errore nella creazione del blob:`, fileError);
      
      // Prova un approccio alternativo con Buffer
      try {
        const fileBuffer = fs.readFileSync(audioFilePath);
        const fileSize = fileBuffer.length;
        console.log(`[${sessionId}] Letto file con Buffer: ${fileSize} bytes`);
        
        // Crea un File simulato
        const fileName = path.basename(audioFilePath);
        const file = new File([fileBuffer], fileName, { type: 'audio/mpeg' });
        openaiFormData.append('file', file);
        console.log(`[${sessionId}] File aggiunto con metodo alternativo`);
      } catch (bufferError) {
        console.error(`[${sessionId}] Errore anche con Buffer:`, bufferError);
        throw new Error(`Impossibile processare il file audio: ${bufferError.message}`);
      }
    }
    
    openaiFormData.append('model', formData.model || 'whisper-1');
    
    if (formData.language) {
      openaiFormData.append('language', formData.language);
    }
    
    if (formData.response_format) {
      openaiFormData.append('response_format', formData.response_format);
    }
    
    // Aggiungi parametri opzionali se presenti
    if (formData.prompt) {
      openaiFormData.append('prompt', formData.prompt);
    }
    
    if (formData.temperature) {
      openaiFormData.append('temperature', formData.temperature);
    }
    
    console.log(`[${sessionId}] Invio richiesta a OpenAI API...`);
    const startTime = Date.now();
    
    // Impostazione di un timeout più lungo per file grandi
    const timeout = 300000; // 5 minuti
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    try {
      const openaiResponse = await fetch(OPENAI_ENDPOINT, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`
        },
        body: openaiFormData as any,
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      const elapsedMs = Date.now() - startTime;
      console.log(`[${sessionId}] Risposta OpenAI ricevuta in ${(elapsedMs/1000).toFixed(1)}s, status: ${openaiResponse.status}`);
      
      // Pulisci il file temporaneo
      try {
        if (fs.existsSync(audioFilePath)) {
          fs.unlinkSync(audioFilePath);
          console.log(`[${sessionId}] File temporaneo eliminato: ${audioFilePath}`);
        }
      } catch (cleanupError) {
        console.error(`[${sessionId}] Errore nel cleanup file temporaneo:`, cleanupError);
      }
      
      if (!openaiResponse.ok) {
        // Clona la risposta per leggere sia come testo che come JSON
        let errorObj: any = {};
        let errorText = "";
        
        try {
          // Prima prova a leggere come JSON
          errorObj = await openaiResponse.json();
          console.error(`[${sessionId}] Errore OpenAI API (JSON):`, errorObj);
        } catch (jsonError) {
          try {
            // Se non è JSON, leggi come testo
            errorText = await openaiResponse.text();
            console.error(`[${sessionId}] Errore OpenAI API (testo):`, errorText);
          } catch (textError) {
            console.error(`[${sessionId}] Impossibile leggere risposta di errore:`, textError);
          }
        }
        
        return {
          statusCode: openaiResponse.status,
          body: JSON.stringify({ 
            error: 'Errore OpenAI API',
            details: errorObj.error?.message || errorText || openaiResponse.statusText,
            status: openaiResponse.status,
            requestId: sessionId
          })
        };
      }
      
      // Clona la risposta per sicurezza
      const responseClone = openaiResponse.clone();
      
      // Gestione della risposta in base al formato richiesto
      const responseFormat = formData.response_format || 'json';
      
      try {
        if (responseFormat === 'text') {
          const text = await openaiResponse.text();
          console.log(`[${sessionId}] Trascrizione completata, lunghezza: ${text.length}`);
          
          return {
            statusCode: 200,
            body: text,
            headers: {
              'Content-Type': 'text/plain'
            }
          };
        } else {
          const json = await openaiResponse.json();
          console.log(`[${sessionId}] Trascrizione completata, formato JSON`);
          
          return {
            statusCode: 200,
            body: JSON.stringify(json),
            headers: {
              'Content-Type': 'application/json'
            }
          };
        }
      } catch (parseError) {
        console.error(`[${sessionId}] Errore nel parsing della risposta:`, parseError);
        
        // Tenta il fallback all'altro formato
        try {
          if (responseFormat === 'text') {
            const json = await responseClone.json();
            console.log(`[${sessionId}] Fallback a JSON riuscito`);
            return {
              statusCode: 200,
              body: JSON.stringify(json),
              headers: {
                'Content-Type': 'application/json'
              }
            };
          } else {
            const text = await responseClone.text();
            console.log(`[${sessionId}] Fallback a testo riuscito`);
            return {
              statusCode: 200,
              body: text,
              headers: {
                'Content-Type': 'text/plain'
              }
            };
          }
        } catch (fallbackError) {
          console.error(`[${sessionId}] Anche il fallback è fallito:`, fallbackError);
          throw new Error(`Impossibile processare la risposta: ${parseError.message}`);
        }
      }
    } catch (fetchError: any) {
      clearTimeout(timeoutId);
      
      if (fetchError.name === 'AbortError') {
        console.error(`[${sessionId}] Timeout durante la richiesta a OpenAI (${timeout/1000}s)`);
        throw new Error(`Timeout durante la richiesta a OpenAI (${timeout/1000}s). Il file potrebbe essere troppo grande o il server OpenAI potrebbe essere sovraccarico.`);
      }
      
      throw fetchError;
    }
  } catch (error: any) {
    console.error(`[${sessionId}] Errore nell'elaborazione:`, error);
    
    return {
      statusCode: 500,
      body: JSON.stringify({ 
        error: 'Errore interno server', 
        message: error.message,
        requestId: sessionId
      })
    };
  }
};

export { handler }; 