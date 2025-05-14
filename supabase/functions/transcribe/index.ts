import { createClient } from 'npm:@supabase/supabase-js@2.39.7';
import OpenAI from 'npm:openai@4.28.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  try {
    // Get the audio data from request
    const formData = await req.formData();
    const audioFile = formData.get('file') as File;

    if (!audioFile) {
      throw new Error('No audio file provided');
    }

    // Get OpenAI key from environment variable
    const openaiKey = Deno.env.get('OPENAI_SECRET_KEY');
    if (!openaiKey) {
      throw new Error('OpenAI API key not found in environment variables');
    }

    // Initialize OpenAI client
    const openai = new OpenAI({
      apiKey: openaiKey
    });

    // Call OpenAI API
    const transcription = await openai.audio.transcriptions.create({
      file: audioFile,
      model: 'whisper-1',
      language: 'it',
      response_format: 'text',
      temperature: 0
    });

    // Return the transcription directly as text
    return new Response(transcription, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/plain',
      },
    });
  } catch (error) {
    console.error('Transcription error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
      },
    });
  }
});