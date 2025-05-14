// Note: This file uses CommonJS syntax
const fetch = require('node-fetch');
const FormData = require('form-data');
const { v4: uuidv4 } = require('uuid');

// Funzione di logging per debug
function log(message, data) {
  console.log(`[${new Date().toISOString()}] ${message}`, data || '');
}

// Handler principale
exports.handler = async (event) => {
  // Genera ID richiesta
  const requestId = uuidv4().substring(0, 8);
  log(`[${requestId}] Richiesta ricevuta`);
  
  // Verifica metodo
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    // Controlla content type
    if (!event.headers['content-type'] || !event.headers['content-type'].includes('multipart/form-data')) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Content-Type must be multipart/form-data' })
      };
    }

    // Verifica API key
    const apiKey = process.env.OPENAI_SECRET_KEY;
    if (!apiKey) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'OpenAI API key not configured' })
      };
    }

    // Estrai e processa il form-data
    const formParser = require('lambda-multipart-parser');
    const formData = await formParser.parse(event);
    
    if (!formData.files || !formData.files.length) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'No file uploaded' })
      };
    }
    
    const audioFile = formData.files[0];
    log(`[${requestId}] File ricevuto`, {
      filename: audioFile.filename,
      contentType: audioFile.contentType,
      size: audioFile.content.length
    });

    // Crea form data per OpenAI
    const form = new FormData();
    form.append('file', audioFile.content, {
      filename: audioFile.filename || 'audio.webm',
      contentType: audioFile.contentType || 'audio/webm'
    });
    form.append('model', 'whisper-1');
    form.append('language', 'it');
    form.append('response_format', 'text');
    form.append('temperature', '0');
    
    // Chiama OpenAI API
    log(`[${requestId}] Invio richiesta a OpenAI`);
    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        ...form.getHeaders()
      },
      body: form
    });
    
    // Analizza risposta
    if (!response.ok) {
      const errorData = await response.text();
      log(`[${requestId}] Errore OpenAI`, {
        status: response.status,
        error: errorData
      });
      return {
        statusCode: response.status,
        body: JSON.stringify({
          error: 'OpenAI API Error',
          details: errorData
        })
      };
    }
    
    // Leggi risultato
    const contentType = response.headers.get('content-type');
    let transcriptionText;
    
    if (contentType && contentType.includes('application/json')) {
      const jsonResponse = await response.json();
      transcriptionText = jsonResponse.text;
    } else {
      transcriptionText = await response.text();
    }
    
    log(`[${requestId}] Trascrizione completata`, {
      length: transcriptionText.length,
      preview: transcriptionText.substring(0, 100)
    });
    
    // Restituisci testo
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'text/plain'
      },
      body: transcriptionText
    };
  } catch (error) {
    log(`[${requestId}] Errore interno`, {
      message: error.message,
      stack: error.stack
    });
    
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Server Error',
        message: error.message
      })
    };
  }
}; 