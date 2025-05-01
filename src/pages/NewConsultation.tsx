import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mic, Upload, AlertCircle, Loader2, UserPlus, ChevronDown } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { drawWaveform } from '../lib/audioVisualizer';
import { transcribeAudio } from '../lib/transcription';
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
    }
  }, [user]);

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
    
    if (isRecording) {
      interval = setInterval(() => {
        const elapsed = Date.now() - recordingStartTimeRef.current;
        setRecordingTime(Math.floor(elapsed / 1000));
      }, 1000);
    } else {
      setRecordingTime(0);
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

      // Specify MIME type explicitly
      mediaRecorderRef.current = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus'
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
        recordingTime
      );

      const minutesUsed = Math.ceil(recordingTime / 60);
      const updated = await updateMinutesUsed(user.id, minutesUsed);
      
      if (!updated) {
        throw new Error('Failed to update minutes used');
      }
      
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
        type: 'audio/webm;codecs=opus'
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
          <button
            disabled={!gdprConsent || !hasMicrophonePermission || isTranscribing || isAnalyzing || !selectedPatient}
            onClick={toggleRecording}
            className={`flex items-center justify-center gap-3 p-8 rounded-lg border-2 border-dashed transition-colors ${
              isRecording
                ? 'bg-red-50 border-red-300 text-red-700'
                : gdprConsent && hasMicrophonePermission && !isTranscribing && !isAnalyzing && selectedPatient
                ? 'border-blue-300 hover:border-blue-400 text-blue-700'
                : 'border-gray-200 text-gray-400'
            }`}
          >
            <Mic className="h-8 w-8" />
            <span className="text-lg font-medium">
              {isRecording ? 'Ferma Registrazione' : 'Avvia Registrazione'}
            </span>
          </button>

          <label
            className={`flex items-center justify-center gap-3 p-8 rounded-lg border-2 border-dashed cursor-pointer transition-colors ${
              gdprConsent && !isTranscribing && !isAnalyzing && selectedPatient
                ? 'border-blue-300 hover:border-blue-400 text-blue-700'
                : 'border-gray-200 text-gray-400'
            }`}
          >
            <input
              type="file"
              accept="audio/*"
              disabled={!gdprConsent || isTranscribing || isAnalyzing || !selectedPatient}
              className="hidden"
              onChange={(e) => {
                console.log(e.target.files?.[0]);
              }}
            />
            <Upload className="h-8 w-8" />
            <span className="text-lg font-medium">Carica File Audio</span>
          </label>
        </div>

        {isRecording && (
          <div className="mt-6">
            <div className="p-4 bg-red-50 rounded-lg flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 bg-red-500 rounded-full animate-pulse" />
                <span className="text-red-700 font-medium">Registrazione in corso...</span>
              </div>
              <span className="text-red-700" id="recording-time">
                {formatTime(recordingTime)}
              </span>
            </div>
            
            <canvas
              ref={canvasRef}
              className="w-full h-32 rounded-lg bg-white"
              width={800}
              height={128}
            />
          </div>
        )}

        {(isTranscribing || isAnalyzing || isSaving || processingStep > 0) && (
          <div className="mt-6 text-sm text-gray-500 flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>{processingSteps[processingStep]}</span>
          </div>
        )}

        {transcription && (
          <div className="mt-6">
            <h3 className="text-lg font-medium text-gray-900 mb-2">Trascrizione</h3>
            <div className="p-4 bg-gray-50 rounded-lg">
              <p className="text-gray-700 whitespace-pre-wrap">{transcription}</p>
            </div>
          </div>
        )}

        {report && (
          <div className="mt-6 space-y-4">
            <h3 className="text-lg font-medium text-gray-900">Referto Medico</h3>
            
            <div className="space-y-4">
              <div>
                <h4 className="font-medium text-gray-700 mb-2">Motivo della Visita</h4>
                <p className="text-gray-600">{report.motivoVisita}</p>
              </div>

              <div>
                <h4 className="font-medium text-gray-700 mb-2">Storia Medica e Familiare</h4>
                <p className="text-gray-600">{report.storiaMedica}</p>
              </div>

              <div>
                <h4 className="font-medium text-gray-700 mb-2">Storia Ponderale</h4>
                <p className="text-gray-600">{report.storiaPonderale}</p>
              </div>

              <div>
                <h4 className="font-medium text-gray-700 mb-2">Abitudini Alimentari</h4>
                <p className="text-gray-600">{report.abitudiniAlimentari}</p>
              </div>

              <div>
                <h4 className="font-medium text-gray-700 mb-2">Attività Fisica</h4>
                <p className="text-gray-600">{report.attivitaFisica}</p>
              </div>

              <div>
                <h4 className="font-medium text-gray-700 mb-2">Fattori Psicologici/Motivazionali</h4>
                <p className="text-gray-600">{report.fattoriPsi}</p>
              </div>

              <div>
                <h4 className="font-medium text-gray-700 mb-2">Esami e Parametri Rilevanti</h4>
                <p className="text-gray-600">{report.esamiParametri}</p>
              </div>

              <div>
                <h4 className="font-medium text-gray-700 mb-2">Punti Critici e Rischi</h4>
                <p className="text-gray-600">{report.puntiCritici}</p>
              </div>

              <div>
                <h4 className="font-medium text-gray-700 mb-2">Note dello Specialista</h4>
                <p className="text-gray-600">{report.noteSpecialista}</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}