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

    // Log di tutte le variabili d'ambiente disponibili (solo i nomi, non i valori)
    console.log('Available env vars:', Object.keys(process.env));

    const apiKey = process.env.OPENAI_API_KEY;
    console.log('API Key present:', !!apiKey);
    console.log('API Key length:', apiKey?.length);

    if (!apiKey) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Missing OpenAI API key' }),
      };
    }

    // Log degli headers ricevuti
    console.log('Request headers:', event.headers);

    // Verifica che ci siano i dati e il content-type
    if (!event.body || !event.headers['content-type']) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'No form data provided' }),
      };
    }

    // Funzione per parsare il multipart form data
    const parseFormData = () => {
      return new Promise<Buffer>((resolve, reject) => {
        const chunks: Buffer[] = [];
        const busboy = Busboy({ 
          headers: { 'content-type': event.headers['content-type'] || '' }
        });

        busboy.on('file', (_, file) => {
          file.on('data', (data) => {
            chunks.push(data);
          });
        });

        busboy.on('finish', () => {
          resolve(Buffer.concat(chunks));
        });

        busboy.on('error', (error) => {
          reject(error);
        });

        if (event.body) {
          const stream = Readable.from(Buffer.from(event.body, 'base64'));
          stream.pipe(busboy);
        } else {
          reject(new Error('No body provided'));
        }
      });
    };

    // Ottieni il file audio dal form data
    const audioBuffer = await parseFormData();

    // Prepara il form data per OpenAI
    const form = new FormData();
    form.append('file', audioBuffer, {
      filename: 'audio.webm',
      contentType: 'audio/webm'
    });
    form.append('model', 'whisper-1');
    form.append('language', 'it');
    form.append('response_format', 'text');

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        ...form.getHeaders()
      },
      // @ts-ignore - form-data è compatibile con node-fetch
      body: form
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('OpenAI API Error:', error);
      return {
        statusCode: response.status,
        body: JSON.stringify({ 
          error: 'OpenAI API Error',
          details: error
        }),
      };
    }

    const result = await response.text();
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
        message: err.message
      }),
    };
  }
};
