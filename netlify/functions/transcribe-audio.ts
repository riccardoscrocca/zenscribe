import { Handler } from '@netlify/functions';
import fetch from 'node-fetch';

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') {
      return {
        statusCode: 405,
        body: 'Method Not Allowed',
      };
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return {
        statusCode: 500,
        body: 'Missing OpenAI API key',
      };
    }

    // Il body della funzione arriva in Base64 → va decodificato
    const contentType = event.headers['content-type'] || event.headers['Content-Type'];
    const buffer = Buffer.from(event.body || '', 'base64');

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': contentType
      },
      body: buffer
    });

    const result = await response.text();

    if (!response.ok) {
      return {
        statusCode: response.status,
        body: `OpenAI error: ${result}`,
      };
    }

    return {
      statusCode: 200,
      body: result,
    };
  } catch (err: any) {
    return {
      statusCode: 500,
      body: `Server error: ${err.message}`,
    };
  }
};
