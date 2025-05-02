import { Handler } from '@netlify/functions';
import fetch from 'node-fetch';
import Busboy from 'busboy';
import { Readable } from 'stream';
import FormData from 'form-data';

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') {
      return {
        statusCode: 405,
        body: JSON.stringify({ error: 'Method Not Allowed' }),
      };
    }

    const apiKey = process.env.OPENAI_API_KEY || process.env.VITE_OPENAI_API_KEY;
    console.log('API Key format check:', {
      present: !!apiKey,
      length: apiKey?.length,
      startsWithSk: apiKey?.startsWith('sk-'),
      // Non logghiamo mai la chiave completa per sicurezza
      firstChars: apiKey?.substring(0, 5),
      lastChars: apiKey?.substring(apiKey?.length - 4)
    });

    if (!apiKey || !apiKey.startsWith('sk-')) {
      return {
        statusCode: 500,
        body: JSON.stringify({ 
          error: 'Invalid OpenAI API key format',
          details: 'The API key should start with sk-'
        }),
      };
    }

    // Verifica che ci siano i dati e il content-type
    if (!event.body || !event.headers['content-type']) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'No form data provided' }),
      };
    }

    console.log('Processing request with content-type:', event.headers['content-type']);

    // Funzione per parsare il multipart form data
    const parseFormData = () => {
      return new Promise<{ buffer: Buffer; mimeType: string }>((resolve, reject) => {
        let fileBuffer: Buffer | null = null;
        let fileMimeType = '';
        const busboy = Busboy({ 
          headers: { 'content-type': event.headers['content-type'] || '' }
        });

        busboy.on('file', (fieldname, file, info) => {
          console.log('Processing file:', { 
            fieldname, 
            filename: info.filename, 
            encoding: info.encoding, 
            mimeType: info.mimeType 
          });
          fileMimeType = info.mimeType;
          const chunks: Buffer[] = [];

          file.on('data', (data) => {
            chunks.push(data);
          });

          file.on('end', () => {
            fileBuffer = Buffer.concat(chunks);
            console.log('File processing complete. Size:', fileBuffer.length, 'MIME type:', fileMimeType);
          });
        });

        busboy.on('field', (fieldname, value) => {
          console.log('Form field:', { fieldname, value });
        });

        busboy.on('finish', () => {
          if (!fileBuffer) {
            console.error('No file buffer found in form data');
            reject(new Error('No file found in form data'));
            return;
          }
          console.log('Busboy processing finished successfully');
          resolve({ buffer: fileBuffer, mimeType: fileMimeType });
        });

        busboy.on('error', (error) => {
          console.error('Busboy error:', error);
          reject(error);
        });

        if (event.body) {
          try {
            const buffer = Buffer.from(event.body, 'base64');
            console.log('Request body size:', buffer.length);
            const stream = Readable.from(buffer);
            stream.pipe(busboy);
          } catch (error) {
            console.error('Error processing request body:', error);
            reject(error);
          }
        } else {
          console.error('No body provided in the request');
          reject(new Error('No body provided'));
        }
      });
    };

    // Ottieni il file audio dal form data
    console.log('Starting form data parsing...');
    const { buffer: audioBuffer, mimeType: fileMimeType } = await parseFormData();
    console.log('Form data parsed successfully. Audio size:', audioBuffer.length, 'MIME type:', fileMimeType);

    // Prepara il form data per OpenAI
    const form = new FormData();
    
    // Determina il content type e l'estensione del file in base al tipo MIME
    let contentType = 'audio/webm';
    let extension = 'webm';
    
    if (fileMimeType.includes('mp3') || fileMimeType.includes('mpeg')) {
      contentType = 'audio/mpeg';
      extension = 'mp3';
    } else if (fileMimeType.includes('wav')) {
      contentType = 'audio/wav';
      extension = 'wav';
    } else if (fileMimeType.includes('m4a')) {
      contentType = 'audio/mp4';
      extension = 'm4a';
    }
    
    console.log('Using content type:', contentType, 'with extension:', extension);
    
    form.append('file', audioBuffer, {
      filename: `audio.${extension}`,
      contentType: contentType
    });
    form.append('model', 'whisper-1');
    form.append('language', 'it');
    form.append('response_format', 'text');
    form.append('temperature', '0');

    // Log dettagliati per il debugging
    console.log('Form data prepared for OpenAI with model, language and response_format parameters');
    console.log('Sending request to OpenAI with audio format:', contentType);
    console.log('Audio buffer size:', audioBuffer.length);

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey.trim()}`, // Rimuoviamo eventuali spazi
        ...form.getHeaders()
      },
      // @ts-ignore - form-data è compatibile con node-fetch
      body: form
    });

    console.log('OpenAI response status:', response.status);
    
    if (!response.ok) {
      const error = await response.text();
      console.error('OpenAI API Error:', error);
      return {
        statusCode: response.status,
        body: JSON.stringify({ 
          error: 'OpenAI API Error',
          details: error,
          status: response.status
        }),
      };
    }

    const result = await response.text();
    console.log('Transcription successful. Length:', result.length);
    
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ result }),
    };
  } catch (err: any) {
    console.error('Server error:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Server Error',
        message: err.message,
        stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
      }),
    };
  }
}; 