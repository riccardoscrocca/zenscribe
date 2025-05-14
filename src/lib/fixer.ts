/**
 * Funzioni di utilità per il debug e la diagnostica delle trascrizioni audio
 */

import { supabase } from './supabase';

/**
 * Diagnostica versione ottimizzata per upload di file MP3 e debug
 * @param fileInfo Informazioni sul file
 * @param error Eventuale errore
 */
export async function logTranscriptionError(
  fileInfo: {
    name?: string;
    type?: string;
    size?: number;
    duration?: number;
  },
  error: Error | string
) {
  const errorMessage = typeof error === 'string' ? error : error.message;
  const errorStack = error instanceof Error ? error.stack : undefined;
  
  console.error('Errore trascrizione audio:', {
    file: fileInfo,
    error: errorMessage,
    stack: errorStack
  });
  
  // Log su database se possibile
  try {
    const { error: logError } = await supabase
      .from('error_logs')
      .insert({
        error_type: 'transcription',
        error_message: errorMessage,
        error_stack: errorStack,
        file_info: fileInfo,
        timestamp: new Date().toISOString()
      });
      
    if (logError) {
      console.error('Errore nel logging:', logError);
    }
  } catch (dbError) {
    console.error('Impossibile salvare log errore:', dbError);
  }
}

/**
 * Verifica se un file è un MP3 valido
 * @param file File da verificare
 */
export function isValidMp3(file: File): boolean {
  // Verifica estensione
  if (file.name.toLowerCase().endsWith('.mp3')) return true;
  
  // Verifica MIME type
  if (file.type.includes('mp3') || file.type.includes('mpeg')) return true;
  
  return false; 
}

/**
 * Diagnostica e fix per problemi comuni con file audio
 * @param file File audio da analizzare
 */
export async function diagnoseAudioFile(file: File): Promise<{ 
  isValid: boolean;
  error?: string;
  warnings: string[];
  fixedFile?: File;
  estimatedDuration?: number;
}> {
  const warnings: string[] = [];
  let isValid = true;
  let error: string | undefined;
  let fixedFile: File | undefined;
  let estimatedDuration: number | undefined;
  
  // Verifica dimensioni
  if (file.size > 25 * 1024 * 1024) {
    isValid = false;
    error = `File troppo grande (${(file.size/1024/1024).toFixed(1)}MB). Limite: 25MB`;
    warnings.push(error);
  } else if (file.size > 10 * 1024 * 1024) {
    warnings.push(`File grande (${(file.size/1024/1024).toFixed(1)}MB). Potrebbe richiedere più tempo per l'elaborazione.`);
  }
  
  // Verifica tipo
  if (!file.type || file.type === 'application/octet-stream') {
    // Prova a correggere il MIME type in base all'estensione
    if (file.name.toLowerCase().endsWith('.mp3')) {
      warnings.push(`MIME type non specificato, uso 'audio/mpeg' in base all'estensione`);
      fixedFile = new File([file], file.name, { type: 'audio/mpeg' });
    } else if (file.name.toLowerCase().endsWith('.wav')) {
      warnings.push(`MIME type non specificato, uso 'audio/wav' in base all'estensione`);
      fixedFile = new File([file], file.name, { type: 'audio/wav' });
    } else if (file.name.toLowerCase().endsWith('.m4a')) {
      warnings.push(`MIME type non specificato, uso 'audio/mp4' in base all'estensione`);
      fixedFile = new File([file], file.name, { type: 'audio/mp4' });
    } else {
      warnings.push(`MIME type non specificato e estensione non riconosciuta`);
    }
  }
  
  // Stima durata in base alla dimensione
  if (file.type.includes('mp3') || file.name.toLowerCase().endsWith('.mp3')) {
    // Calcolo approssimativo per MP3 a 128kbps
    estimatedDuration = Math.ceil(file.size / 1024 / 16);
    if (estimatedDuration > 60 * 60) { // Più di un'ora
      warnings.push(`Durata stimata molto lunga: ${Math.floor(estimatedDuration/60)} minuti`);
    }
  } else {
    // Per altri formati (potenzialmente di qualità superiore)
    estimatedDuration = Math.ceil(file.size / 1024 / 32);
  }
  
  return { 
    isValid, 
    error, 
    warnings, 
    fixedFile: fixedFile || undefined,
    estimatedDuration
  };
} 