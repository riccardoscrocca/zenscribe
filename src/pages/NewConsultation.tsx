import React, { useEffect, useState, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Mic, Upload, AlertCircle, Loader2, UserPlus, ChevronDown } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { drawWaveform } from '../lib/audioVisualizer';
import { transcribeAudio, uploadAndTranscribeFile, uploadAndTranscribeFileDedicated } from '../lib/transcription';
import { analyzeConsultation, saveConsultation } from '../lib/aiAgent';
import { supabase } from '../lib/supabase';
import type { MedicalReport } from '../lib/aiInstructions';
import { checkMinutesAvailable, updateMinutesUsed } from '../lib/subscriptions';

interface Patient {
  id: string;
  first_name: string;
  last_name: string;
  birth_date: string;
}

const processingSteps = [
  'Registrazione audio',
  'Trascrizione',
  'Analisi',
  'Generazione referto',
  'Salvataggio'
];

export function NewConsultation() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [isRecording, setIsRecording] = useState(false);
  const [gdprConsent, setGdprConsent] = useState(false);
  const [hasMicrophonePermission, setHasMicrophonePermission] = useState<boolean | null>(null);
  const [recordingTime, setRecordingTime] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [transcription, setTranscription] = useState<string>('');
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [report, setReport] = useState<MedicalReport | null>(null);
  const [processingStep, setProcessingStep] = useState<number>(0);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<string>('');
  const [visitType, setVisitType] = useState<'prima_visita' | 'visita_controllo'>('prima_visita');
  const [loadingPatients, setLoadingPatients] = useState(true);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const animationFrameRef = useRef<number>();
  const recordingStartTimeRef = useRef<number>(0);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const [showDebugInfo, setShowDebugInfo] = useState(false);
  const [fileDetails, setFileDetails] = useState<{
    name: string;
    type: string;
    size: string;
    duration: number;
    lastModified: string;
  } | null>(null);
  const [transcriptionStartTime, setTranscriptionStartTime] = useState<number | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);

  useEffect(() => {
    if (user?.id) {
      loadPatients();
      
      // Leggi l'ID del paziente dalla query string
      const searchParams = new URLSearchParams(location.search);
      const patientId = searchParams.get('patientId');
      
      if (patientId) {
        setSelectedPatient(patientId);
      }
    }
  }, [user, location]);

  useEffect(() => {
    if (selectedPatient && patients.length > 0) {
      const patientExists = patients.some(p => p.id === selectedPatient);
      if (!patientExists) {
        setError('Paziente non trovato. Seleziona un paziente dalla lista.');
        setSelectedPatient('');
      }
    }
  }, [selectedPatient, patients]);

  useEffect(() => {
    navigator.mediaDevices.getUserMedia({ audio: true })
      .then((stream) => {
        setHasMicrophonePermission(true);
        setError(null);
      })
      .catch((err) => {
        setHasMicrophonePermission(false);
        setError('È necessario l\'accesso al microfono per la registrazione. Abilitalo nelle impostazioni del browser.');
      });

    return () => {
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(track => track.stop());
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    let finalTime = 0;
    
    if (isRecording) {
      interval = setInterval(() => {
        const elapsed = Date.now() - recordingStartTimeRef.current;
        const seconds = Math.ceil(elapsed / 1000);
        setRecordingTime(seconds);
        finalTime = seconds;
      }, 1000);
    } else if (finalTime > 0) {
      // Mantieni il tempo finale per il salvataggio
      setRecordingTime(finalTime);
    }

    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [isRecording]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    if (isTranscribing && transcriptionStartTime) {
      interval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - transcriptionStartTime) / 1000);
        setElapsedTime(elapsed);
      }, 1000);
    } else {
      setElapsedTime(0);
    }
    
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isTranscribing, transcriptionStartTime]);

  const loadPatients = async () => {
    try {
      if (!user?.id) {
        throw new Error('User not authenticated');
      }

      const { data, error } = await supabase
        .from('patients')
        .select('id, first_name, last_name, birth_date')
        .eq('user_id', user.id)
        .order('last_name', { ascending: true });

      if (error) throw error;
      setPatients(data || []);
    } catch (err) {
      const error = err as Error;
      setError(`Errore nel caricamento dei pazienti: ${error.message}`);
    } finally {
      setLoadingPatients(false);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const formatElapsedTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const startRecording = async () => {
    try {
      if (!user?.id) throw new Error('User not authenticated');
      
      const hasMinutes = await checkMinutesAvailable(user.id, 60);
      if (!hasMinutes) {
        setError('Minuti disponibili esauriti. Per continuare a registrare consultazioni, è necessario aggiornare il piano di abbonamento.');
        return;
      }

      audioChunksRef.current = [];
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      audioContextRef.current = new AudioContext();
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 2048;

      const source = audioContextRef.current.createMediaStreamSource(stream);
      source.connect(analyserRef.current);

      // Determina il formato audio supportato
      const mimeTypes = [
        'audio/webm;codecs=opus',
        'audio/mp4',
        'audio/webm',
        'audio/ogg;codecs=opus'
      ];
      
      const supportedType = mimeTypes.find(type => MediaRecorder.isTypeSupported(type));
      
      if (!supportedType) {
        throw new Error('Nessun formato audio supportato dal browser');
      }

      // Usa il formato supportato
      mediaRecorderRef.current = new MediaRecorder(stream, {
        mimeType: supportedType
      });
      
      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorderRef.current.start(1000);

      recordingStartTimeRef.current = Date.now();
      setIsRecording(true);
      setError(null);
      setTranscription('');
      setReport(null);
      setProcessingStep(0);

      const bufferLength = analyserRef.current.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      const canvas = canvasRef.current;
      const canvasCtx = canvas?.getContext('2d');

      const draw = () => {
        if (!analyserRef.current || !canvas || !canvasCtx) return;
        animationFrameRef.current = requestAnimationFrame(draw);
        analyserRef.current.getByteTimeDomainData(dataArray);
        drawWaveform(canvasCtx, dataArray, bufferLength, canvas);
      };

      draw();
    } catch (err) {
      const error = err as Error;
      setError(`Errore durante l'avvio della registrazione: ${error.message}`);
      console.error('Errore registrazione:', err);
    }
  };

  const processConsultation = async (transcription: string) => {
    if (!selectedPatient) {
      setError('Seleziona un paziente prima di procedere');
      return;
    }

    if (!user?.id) {
      setError('Sessione utente non valida. Effettua nuovamente il login.');
      navigate('/login');
      return;
    }

    try {
      setIsAnalyzing(true);
      setProcessingStep(2);

      const selectedPatientData = patients.find(p => p.id === selectedPatient);
      const patientName = selectedPatientData 
        ? `${selectedPatientData.first_name} ${selectedPatientData.last_name}`
        : undefined;

      const { report } = await analyzeConsultation({
        patientId: selectedPatient,
        transcription,
        date: new Date(),
        patientName
      });

      setReport(report);
      setProcessingStep(3);

      setIsSaving(true);
      
      // Assicurati che la durata sia un numero positivo
      let currentRecordingTime = recordingTime;
      if (!currentRecordingTime || currentRecordingTime <= 0) {
        // Nuova formula di stima più accurata:
        // - Assume una velocità media di parlato di 150 parole al minuto
        // - Stima 5 caratteri per parola in media
        // - Aggiunge un margine del 20% per sicurezza
        const wordsCount = transcription.split(/\s+/).length;
        const estimatedMinutes = (wordsCount / 150) * 1.2; // 150 parole/min + 20% margine
        currentRecordingTime = Math.max(30, Math.ceil(estimatedMinutes * 60)); // Minimo 30 secondi
        console.warn('Durata non rilevata, stima basata sul conteggio parole:', {
          parole: wordsCount,
          minuti_stimati: estimatedMinutes,
          secondi_stimati: currentRecordingTime
        });
      }
      
      console.log('Saving consultation with recording time:', currentRecordingTime, 'seconds');

      // Salva la consultazione con il campo duration_seconds
      const result = await saveConsultation(
        {
          patientId: selectedPatient,
          transcription,
          date: new Date(),
          patientName
        },
        report,
        gdprConsent,
        visitType,
        currentRecordingTime
      );
      
      console.log('Consultation saved with ID:', result?.id, 'and duration:', result?.duration_seconds);
      
      setProcessingStep(4);
      setIsSaving(false);
      
      navigate(`/app/patients/${selectedPatient}`);
    } catch (error) {
      const err = error as Error;
      setError(`Errore durante il salvataggio: ${err.message}`);
      setProcessingStep(0);
      setIsSaving(false);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const stopRecording = async () => {
    if (mediaRecorderRef.current && mediaStreamRef.current) {
      mediaRecorderRef.current.stop();
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      
      setIsRecording(false);

      // Wait for all chunks to be collected
      await new Promise(resolve => {
        if (mediaRecorderRef.current) {
          mediaRecorderRef.current.addEventListener('stop', resolve, { once: true });
        } else {
          resolve(null);
        }
      });

      const audioBlob = new Blob(audioChunksRef.current, { 
        type: mediaRecorderRef.current?.mimeType || 'audio/webm;codecs=opus'
      });

      try {
        setIsTranscribing(true);
        setProcessingStep(1);
        const text = await transcribeAudio(audioBlob);
        setTranscription(text);

        await processConsultation(text);
      } catch (error) {
        const err = error as Error;
        setError(`Elaborazione fallita: ${err.message}`);
      } finally {
        setIsTranscribing(false);
      }
    }
  };

  const toggleRecording = () => {
    if (!isRecording) {
      startRecording();
    } else {
      stopRecording();
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!event.target.files || event.target.files.length === 0) return;

    const file = event.target.files[0];
    setProcessingStep(1);
    setIsTranscribing(true);
    setTranscription('');
    setError('');
    setTranscriptionStartTime(Date.now());

    try {
      const fileInfo = {
        name: file.name,
        type: file.type || 'sconosciuto',
        size: `${(file.size / 1024 / 1024).toFixed(2)} MB`,
        lastModified: new Date(file.lastModified).toLocaleString()
      };
      
      console.log('File ricevuto:', fileInfo);
      setFileDetails({...fileInfo, duration: 0});

      if (!selectedPatient) {
        throw new Error('Seleziona un paziente prima di caricare un file audio');
      }

      const isValidAudioFile = file.type.startsWith('audio/') || 
                              ['.mp3', '.wav', '.ogg', '.m4a'].some(ext => 
                                file.name.toLowerCase().endsWith(ext));

      if (!isValidAudioFile) {
        throw new Error('Il file selezionato non è un file audio valido');
      }

      setTranscription('');
      
      console.log('Inizio trascrizione del file audio');

      // Calcola la durata approssimativa del file audio (in secondi)
      const audioElement = document.createElement('audio');
      audioElement.src = URL.createObjectURL(file);
      
      console.log('Audio element creato, calcolo durata...');
      
      let duration = 0;
      try {
        const durationPromise = new Promise<number>((resolve, reject) => {
          // Imposta un timeout più lungo per il caricamento dei metadati di file di grandi dimensioni
          const timeoutId = setTimeout(() => {
            console.warn('Timeout nel rilevamento durata, uso calcolo approssimativo');
            
            // Calcolo approssimativo basato sulla dimensione del file per MP3
            // Un file MP3 a 128kbps è circa 1MB per 8 minuti
            if (file.type.includes('mp3') || file.type.includes('mpeg') || file.name.toLowerCase().endsWith('.mp3')) {
              // Stima: dimensione_KB / 16 = secondi (128kbps)
              const estimatedDuration = Math.ceil(file.size / 1024 / 16);
              console.log('Durata MP3 stimata dalla dimensione:', estimatedDuration, 'secondi');
              
              // Per sicurezza, limita la stima a un valore ragionevole
              const cappedDuration = Math.min(estimatedDuration, 3600); // Max 60 minuti
              resolve(cappedDuration);
            } else {
              // Per altri tipi di file impostiamo un valore ragionevole basato sulla dimensione
              const estimatedDuration = Math.ceil(file.size / 1024 / 32); // Presume una qualità maggiore
              const cappedDuration = Math.min(Math.max(estimatedDuration, 60), 3600); // Min 1 min, max 60 min
              console.log('Durata stimata per file non-MP3:', cappedDuration, 'secondi');
              resolve(cappedDuration);
            }
          }, 10000); // 10 secondi di timeout per file più grandi
          
          audioElement.addEventListener('loadedmetadata', () => {
            clearTimeout(timeoutId);
            const detectedDuration = Math.ceil(audioElement.duration);
            console.log('Durata audio rilevata correttamente:', detectedDuration, 'secondi');
            resolve(detectedDuration);
          });
          
          audioElement.addEventListener('error', (e) => {
            clearTimeout(timeoutId);
            console.error('Error loading audio:', e);
            // In caso di errore, stima comunque la durata invece di fallire
            const estimatedDuration = Math.ceil(file.size / 1024 / 16);
            const cappedDuration = Math.min(estimatedDuration, 3600);
            console.log('Errore nel rilevamento durata, uso stima:', cappedDuration);
            resolve(cappedDuration);
          });
        });
        
        duration = await durationPromise;
        setRecordingTime(duration);
        setFileDetails({...fileInfo, duration});
        console.log('Durata finale utilizzata:', duration, 'secondi');
      } catch (error) {
        console.error('Errore nel calcolo della durata:', error);
        // Non fallire completamente ma usa una stima conservativa
        duration = Math.ceil(file.size / 1024 / 16);
        duration = Math.min(duration, 1800); // Max 30 minuti
        console.log('Usando durata di fallback:', duration);
        setRecordingTime(duration);
        setFileDetails({...fileInfo, duration});
      }

      // Determina se è un file MP3 o M4A
      const isMP3 = file.type.includes('mp3') || file.type.includes('mpeg') || file.name.toLowerCase().endsWith('.mp3');
      const isM4A = file.type.includes('m4a') || file.type.includes('mp4') || file.name.toLowerCase().endsWith('.m4a');
      const isLargeFile = file.size > 5 * 1024 * 1024; // Più di 5MB è considerato grande
      
      console.log('Dettagli trascrizione:', { 
        durata: duration,
        tipo: file.type,
        isMP3,
        isM4A,
        isLargeFile,
        dimensione: `${(file.size / 1024 / 1024).toFixed(2)} MB`,
        recordingTime
      });
      
      // Avviso per file molto grandi
      if (file.size > 8 * 1024 * 1024) {
        console.log('File molto grande, potrebbe superare i limiti del server');
        setError('Attenzione: File audio di grandi dimensioni (> 8MB). Consigliamo di convertire il file in formato più efficiente (m4a) o comprimerlo a una qualità inferiore (96kbps) prima del caricamento.');
      } else if (file.size > 5 * 1024 * 1024) {
        console.log('File grande, la trascrizione potrebbe richiedere diversi minuti');
        setError('File audio di grandi dimensioni. La trascrizione potrebbe richiedere diversi minuti, attendere prego...');
      }

      let text;
      try {
        // Per file M4A di qualsiasi dimensione, usa sempre upload-direct
        if (isM4A) {
          console.log('File M4A rilevato, utilizzo funzione uploadAndTranscribeFileDedicated per accesso diretto a OpenAI');
          text = await uploadAndTranscribeFileDedicated(file);
        }
        // Per i file molto grandi o lunghi, usa la funzione dedicata
        else if (isLargeFile || duration > 300) { // 5 minuti o più
          console.log('File grande/lungo, utilizzo funzione dedicata');
          text = await uploadAndTranscribeFileDedicated(file);
        } else if (isMP3) {
          console.log('CHIAMATA A uploadAndTranscribeFileDedicated per MP3 standard');
          text = await uploadAndTranscribeFileDedicated(file);
        } else {
          console.log('CHIAMATA A uploadAndTranscribeFile per altri formati');
          text = await uploadAndTranscribeFile(file);
        }
        
        console.log('Trascrizione completata, lunghezza:', text.length);
        setTranscription(text);

        // Processa la consultazione con la durata del file
        console.log('Inizio processConsultation con durata:', duration);
        await processConsultation(text);
      } catch (transcriptionError) {
        console.error('Errore durante la trascrizione:', transcriptionError);
        
        // Se fallisce, prova con l'altra funzione come fallback
        console.log('FALLBACK: Tentativo con funzione alternativa dopo fallimento');
        try {
          // Se abbiamo usato uploadAndTranscribeFileDedicated, proviamo con upload-direct direttamente
          if (isM4A) {
            console.log('ERRORE con M4A. Il file potrebbe essere danneggiato o in un formato non supportato.');
            throw new Error('Il file M4A non può essere elaborato. Prova a convertirlo in un altro formato come MP3 a 96kbps.');
          }
          else if (isMP3 || isLargeFile) {
            console.log('Fallback a uploadAndTranscribeFile');
            text = await uploadAndTranscribeFile(file);
          } else {
            console.log('Fallback a uploadAndTranscribeFileDedicated');
            text = await uploadAndTranscribeFileDedicated(file);
          }
          
          console.log('Trascrizione con fallback completata, lunghezza:', text.length);
          setTranscription(text);
          await processConsultation(text);
        } catch (fallbackError) {
          console.error('Errore anche nel fallback:', fallbackError);
          throw fallbackError;
        }
      }
    } catch (error) {
      const err = error as Error;
      console.error('File upload error:', err);
      
      // Messaggi di errore più specifici per problemi comuni
      if (err.message.includes('troppo grande')) {
        setError(`Elaborazione fallita: ${err.message}`);
      } else if (err.message.includes('timeout') || err.message.includes('timed out')) {
        setError(`Elaborazione fallita: Timeout durante l'elaborazione. Il file potrebbe essere troppo grande (${(file.size / 1024 / 1024).toFixed(1)} MB). Prova a convertirlo in un formato più efficiente (m4a) o a comprimerlo.`);
      } else if (err.message.includes('500') || err.message.includes('Internal Error')) {
        setError(`Elaborazione fallita: Errore trascrizione (500): Errore interno del server. Il file potrebbe essere troppo grande o in un formato non ottimale. Prova a convertirlo in formato m4a o comprimi l'MP3 a 96kbps.`);
      } else {
        setError(`Elaborazione fallita: ${err.message}`);
      }
      
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } finally {
      setIsTranscribing(false);
      setProcessingStep(0);
    }
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold text-gray-900 mb-6">Nuova Consultazione</h1>

      <div className="bg-white rounded-lg shadow p-6">
        {error && (
          <div className="mb-6 p-4 bg-red-50 rounded-lg flex items-center gap-2 text-red-700">
            <AlertCircle className="h-5 w-5" />
            <span>{error}</span>
          </div>
        )}

        {/* Debug mode toggle and info */}
        <div className="mb-4 text-right">
          <button 
            onClick={() => setShowDebugInfo(!showDebugInfo)}
            className="text-xs text-gray-500 underline"
          >
            {showDebugInfo ? 'Nascondi dettagli debug' : 'Mostra dettagli debug'}
          </button>
        </div>

        {showDebugInfo && fileDetails && (
          <div className="mb-6 p-3 bg-gray-50 rounded-lg border text-sm text-gray-700">
            <h3 className="font-medium mb-1">Dettagli File:</h3>
            <ul className="space-y-1">
              <li><span className="font-medium">Nome:</span> {fileDetails.name}</li>
              <li><span className="font-medium">Tipo:</span> {fileDetails.type}</li>
              <li><span className="font-medium">Dimensione:</span> {fileDetails.size}</li>
              <li><span className="font-medium">Durata:</span> {fileDetails.duration} secondi ({formatTime(fileDetails.duration)})</li>
              <li><span className="font-medium">Ultima modifica:</span> {fileDetails.lastModified}</li>
            </ul>
          </div>
        )}

        <div className="mb-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Seleziona Paziente
            </label>
            {loadingPatients ? (
              <div className="flex items-center gap-2 text-gray-500">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span>Caricamento pazienti...</span>
              </div>
            ) : (
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <select
                    value={selectedPatient}
                    onChange={(e) => setSelectedPatient(e.target.value)}
                    className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  >
                    <option value="">Seleziona un paziente</option>
                    {patients.map((patient) => (
                      <option key={patient.id} value={patient.id}>
                        {patient.last_name}, {patient.first_name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400 pointer-events-none" />
                </div>
                <button
                  type="button"
                  onClick={() => navigate('/app/new-patient')}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  <UserPlus className="h-5 w-5" />
                  Aggiungi Nuovo Paziente
                </button>
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Tipo di Visita
            </label>
            <select
              value={visitType}
              onChange={(e) => setVisitType(e.target.value as 'prima_visita' | 'visita_controllo')}
              className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            >
              <option value="prima_visita">Prima Visita</option>
              <option value="visita_controllo">Visita di Controllo</option>
            </select>
          </div>

          <div>
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={gdprConsent}
                onChange={(e) => setGdprConsent(e.target.checked)}
                className="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-600">
                Il paziente acconsente alla registrazione audio e al trattamento dei dati (conformità GDPR)
              </span>
            </label>
          </div>
          
          <div className="bg-blue-50 p-3 rounded-lg border border-blue-100 text-sm text-blue-700">
            <p className="font-medium mb-1">Informazioni sul caricamento file</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Dimensione massima consigliata: 5MB</li>
              <li>Per file audio più grandi, si consiglia di comprimerli prima del caricamento</li>
              <li>Formati supportati: MP3, WAV, M4A</li>
              <li>Durata massima consigliata: 15 minuti</li>
            </ul>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <button
              disabled={!gdprConsent || !hasMicrophonePermission || isTranscribing || isAnalyzing || !selectedPatient}
              onClick={toggleRecording}
              className={`
                w-full px-4 py-3 rounded-lg font-medium flex items-center justify-center gap-2
                ${isRecording
                  ? 'bg-red-600 hover:bg-red-700 text-white'
                  : 'bg-blue-600 hover:bg-blue-700 text-white'
                }
                disabled:opacity-50 disabled:cursor-not-allowed
              `}
            >
              <Mic className={`h-5 w-5 ${isRecording ? 'animate-pulse' : ''}`} />
              {isRecording ? `Registrazione in corso (${formatTime(recordingTime)})` : 'Avvia Registrazione'}
            </button>

            <div className="relative">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileUpload}
                accept="audio/*"
                className="hidden"
                disabled={isTranscribing || isAnalyzing || !selectedPatient || !gdprConsent}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isTranscribing || isAnalyzing || !selectedPatient || !gdprConsent}
                className="w-full px-4 py-3 rounded-lg font-medium flex items-center justify-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isTranscribing ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Trascrizione in corso...
                  </>
                ) : (
                  <>
                    <Upload className="h-5 w-5" />
                    Carica Audio
                  </>
                )}
              </button>
            </div>
          </div>

          <div className="flex items-center justify-center">
            <canvas
              ref={canvasRef}
              className="w-full h-32 bg-gray-50 rounded-lg"
            />
          </div>
        </div>

        {(isTranscribing || isAnalyzing) && (
          <div className="mt-6 p-6 bg-white rounded-lg shadow">
            <div className="flex flex-col items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center">
                <Loader2 className="h-8 w-8 text-blue-600 animate-spin" />
              </div>
              
              <h3 className="text-lg font-medium text-gray-900">
                {isTranscribing ? 'Trascrizione in corso...' : 'Analisi in corso...'}
              </h3>
              
              <p className="text-sm text-gray-500">
                {processingSteps[processingStep]}
                {isTranscribing && fileDetails && fileDetails.duration > 300 && (
                  <span className="ml-1 text-amber-600">
                    (File lungo: {Math.floor(fileDetails.duration / 60)} min)
                  </span>
                )}
              </p>
              
              {isTranscribing && elapsedTime > 0 && (
                <div className="text-xs text-gray-500 flex items-center gap-2">
                  <span>Tempo trascorso: {formatElapsedTime(elapsedTime)}</span>
                  {fileDetails?.duration && fileDetails.duration > 60 && (
                    <span>| Durata stimata file: {formatTime(fileDetails.duration)}</span>
                  )}
                </div>
              )}
            
              <div className="w-full max-w-md mt-2">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-blue-700">
                    {uploadProgress > 0 ? `${uploadProgress}%` : `Passo ${processingStep + 1} di ${processingSteps.length}`}
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                    style={{
                      width: `${uploadProgress > 0 ? uploadProgress : (processingStep + 1) * 25}%`
                    }}
                  />
                </div>
                
                {isTranscribing && elapsedTime > 120 && (
                  <p className="mt-2 text-xs text-amber-600">
                    La trascrizione di file audio lunghi può richiedere diversi minuti. 
                    Non chiudere questa finestra fino al completamento.
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}