import { Handler } from '@netlify/functions';
import fetch from 'node-fetch';
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
        body: JSON.stringify({ 
          error: 'Missing OpenAI API key',
          envVars: Object.keys(process.env)
        }),
      };
    }

    // Log degli headers ricevuti
    console.log('Request headers:', event.headers);

    // Parse the multipart form data
    if (!event.body) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'No form data provided' }),
      };
    }

    // Log per debug
    console.log('Content-Type:', event.headers['content-type']);
    console.log('Body length:', event.body.length);

    // Crea un nuovo FormData per OpenAI
    const formData = new FormData();
    formData.append('file', Buffer.from(event.body, 'base64'), {
      filename: 'audio.webm',
      contentType: event.headers['content-type']
    });
    formData.append('model', 'whisper-1');
    formData.append('language', 'it');
    formData.append('response_format', 'text');

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        ...formData.getHeaders()
      },
      body: formData
    });

    const result = await response.text();
    console.log('OpenAI Response Status:', response.status);

    if (!response.ok) {
      console.error('OpenAI API Error:', result);
      return {
        statusCode: response.status,
        body: JSON.stringify({ 
          error: 'OpenAI API Error',
          details: result,
          statusCode: response.status
        }),
      };
    }

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
        stack: err.stack
      }),
    };
  }
};
