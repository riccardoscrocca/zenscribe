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
      const currentRecordingTime = recordingTime;
      console.log('Saving consultation with recording time:', currentRecordingTime);
      
      // Prima aggiorniamo i minuti
      console.log('Updating minutes used with recording time:', currentRecordingTime);
      const updated = await updateMinutesUsed(user.id, currentRecordingTime);
      console.log('Minutes update result:', { updated, recordingTime: currentRecordingTime });
      
      if (!updated) {
        throw new Error('Failed to update minutes used');
      }

      // Poi salviamo la consultazione
      await saveConsultation(
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
    const file = event.target.files?.[0];
    if (!file) return;

    console.log('File selezionato:', { 
      name: file.name, 
      type: file.type, 
      size: file.size 
    });

    if (!selectedPatient) {
      setError('Seleziona un paziente prima di caricare un file');
      return;
    }

    // Check file type
    if (!file.type.startsWith('audio/')) {
      setError('Il file deve essere un file audio');
      return;
    }

    // Check file size (max 100MB)
    if (file.size > 100 * 1024 * 1024) {
      setError('Il file non può superare i 100MB');
      return;
    }

    try {
      if (!user?.id) throw new Error('User not authenticated');
      
      const hasMinutes = await checkMinutesAvailable(user.id, 60);
      if (!hasMinutes) {
        setError('Minuti disponibili esauriti. Per continuare a registrare consultazioni, è necessario aggiornare il piano di abbonamento.');
        return;
      }

      // Imposta lo stato di trascrizione
      setIsTranscribing(true);
      setProcessingStep(1);
      setError(null);
      setTranscription('');
      
      console.log('Inizio trascrizione del file audio');

      // Calcola la durata approssimativa del file audio (in secondi)
      const audioElement = document.createElement('audio');
      audioElement.src = URL.createObjectURL(file);
      
      console.log('Audio element creato, calcolo durata...');
      
      let duration = 0;
      await new Promise((resolve, reject) => {
        audioElement.addEventListener('loadedmetadata', async () => {
          duration = Math.ceil(audioElement.duration);
          console.log('Durata audio rilevata:', duration, 'secondi');
          setRecordingTime(duration);
          resolve(null);
        });
        
        audioElement.addEventListener('error', (e) => {
          console.error('Error loading audio:', e);
          reject(new Error('Errore nel caricamento del file audio'));
        });
      });

      // Determina se è un file MP3
      const isMP3 = file.type.includes('mp3') || file.type.includes('mpeg') || file.name.toLowerCase().endsWith('.mp3');
      
      console.log('Dettagli trascrizione:', { 
        durata: duration,
        tipo: file.type,
        isMP3
      });
      
      let text;
      try {
        if (isMP3) {
          console.log('CHIAMATA A uploadAndTranscribeFileDedicated');
          text = await uploadAndTranscribeFileDedicated(file);
        } else {
          console.log('CHIAMATA A uploadAndTranscribeFile');
          text = await uploadAndTranscribeFile(file);
        }
        
        console.log('Trascrizione completata, lunghezza:', text.length);
        setTranscription(text);
  
        // Processa la consultazione con la durata del file
        console.log('Inizio processConsultation con durata:', duration);
        await processConsultation(text);
      } catch (transcriptionError) {
        console.error('Errore durante la trascrizione:', transcriptionError);
        
        // Se fallisce la funzione dedicata per MP3, prova con la funzione standard come fallback
        if (isMP3) {
          console.log('FALLBACK: Tentativo con funzione standard dopo fallimento funzione dedicata');
          try {
            text = await uploadAndTranscribeFile(file);
            console.log('Trascrizione con fallback completata, lunghezza:', text.length);
            setTranscription(text);
            await processConsultation(text);
          } catch (fallbackError) {
            console.error('Errore anche nel fallback:', fallbackError);
            throw fallbackError;
          }
        } else {
          throw transcriptionError;
        }
      }
    } catch (error) {
      const err = error as Error;
      console.error('File upload error:', err);
      setError(`Elaborazione fallita: ${err.message}`);
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
              </p>
            
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
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}