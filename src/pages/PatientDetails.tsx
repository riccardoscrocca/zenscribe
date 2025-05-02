import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  User, 
  Calendar, 
  Mail, 
  Phone, 
  FileText, 
  ArrowLeft, 
  Loader2, 
  AlertCircle,
  X,
  Scale,
  Ruler,
  Copy,
  Download,
  Printer,
  Trash2,
  Save,
  Edit,
  PencilLine
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { generatePDF } from '../lib/pdfGenerator';
import { Toast } from '../components/Toast';

interface Patient {
  id: string;
  first_name: string;
  last_name: string;
  birth_date: string;
  gender: string;
  email: string | null;
  phone: string | null;
  notes: string | null;
  weight: number | null;
  height: number | null;
  created_at: string;
}

interface Consultation {
  id: string;
  created_at: string;
  motivo_visita: string | null;
  storia_medica: string | null;
  storia_ponderale: string | null;
  abitudini_alimentari: string | null;
  attivita_fisica: string | null;
  fattori_psi: string | null;
  esami_parametri: string | null;
  punti_critici: string | null;
  note_specialista: string | null;
  audio_url: string | null;
  transcription: string | null;
  medical_report: any;
}

interface EditableConsultation extends Consultation {
  isEditing?: boolean;
}

export function PatientDetails() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [patient, setPatient] = useState<Patient | null>(null);
  const [consultations, setConsultations] = useState<Consultation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedConsultation, setSelectedConsultation] = useState<EditableConsultation | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editedPatient, setEditedPatient] = useState<Patient | null>(null);

  useEffect(() => {
    loadPatientData();
  }, [id]);

  const loadPatientData = async () => {
    try {
      setLoading(true);
      setError(null);

      const { data: patientData, error: patientError } = await supabase
        .from('patients')
        .select('*')
        .eq('id', id)
        .single();

      if (patientError) throw patientError;
      setPatient(patientData);
      setEditedPatient(patientData);

      const { data: consultationsData, error: consultationsError } = await supabase
        .from('consultations')
        .select(`
          id,
          created_at,
          audio_url,
          transcription,
          medical_report,
          motivo_visita,
          storia_medica,
          storia_ponderale,
          abitudini_alimentari,
          attivita_fisica,
          fattori_psi,
          esami_parametri,
          punti_critici,
          note_specialista
        `)
        .eq('patient_id', id)
        .order('created_at', { ascending: false });

      if (consultationsError) throw consultationsError;
      setConsultations(consultationsData || []);

    } catch (err) {
      const error = err as Error;
      setError(`Errore nel caricamento dei dati: ${error.message}`);
      console.error('Errore nel caricamento dei dati:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSavePatient = async () => {
    if (!editedPatient) return;

    try {
      setSaving(true);
      setError(null);

      const { error: updateError } = await supabase
        .from('patients')
        .update({
          first_name: editedPatient.first_name,
          last_name: editedPatient.last_name,
          birth_date: editedPatient.birth_date,
          gender: editedPatient.gender,
          email: editedPatient.email,
          phone: editedPatient.phone,
          weight: editedPatient.weight,
          height: editedPatient.height,
          notes: editedPatient.notes
        })
        .eq('id', editedPatient.id);

      if (updateError) throw updateError;

      setPatient(editedPatient);
      setIsEditing(false);
      setShowToast(true);
    } catch (err) {
      const error = err as Error;
      setError(`Errore durante il salvataggio: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDeletePatient = async () => {
    try {
      setDeleting(true);
      setError(null);

      const { error: consultationsError } = await supabase
        .from('consultations')
        .delete()
        .eq('patient_id', id);

      if (consultationsError) throw consultationsError;

      const { error: patientError } = await supabase
        .from('patients')
        .delete()
        .eq('id', id);

      if (patientError) throw patientError;

      navigate('/app/patients');
    } catch (err) {
      const error = err as Error;
      setError(`Errore durante l'eliminazione: ${error.message}`);
    } finally {
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  const handleCopyText = (consultation: Consultation) => {
    if (!patient) return;

    const sections = [
      `REFERTO MEDICO\n`,
      `Data: ${formatDate(consultation.created_at)}`,
      `Paziente: ${patient.first_name} ${patient.last_name}\n`,
      `1. MOTIVO DELLA VISITA\n${consultation.motivo_visita || 'Non specificato'}\n`,
      `2. STORIA MEDICA E FAMILIARE\n${consultation.storia_medica || 'Non specificata'}\n`,
      `3. STORIA PONDERALE\n${consultation.storia_ponderale || 'Non specificata'}\n`,
      `4. ABITUDINI ALIMENTARI\n${consultation.abitudini_alimentari || 'Non specificate'}\n`,
      `5. ATTIVITÀ FISICA\n${consultation.attivita_fisica || 'Non specificata'}\n`,
      `6. FATTORI PSICOLOGICI/MOTIVAZIONALI\n${consultation.fattori_psi || 'Non specificati'}\n`,
      `7. ESAMI E PARAMETRI RILEVANTI\n${consultation.esami_parametri || 'Non specificati'}\n`,
      `8. PUNTI CRITICI E RISCHI\n${consultation.punti_critici || 'Non specificati'}\n`,
      `9. NOTE DELLO SPECIALISTA\n${consultation.note_specialista || 'Non specificate'}\n`
    ];

    navigator.clipboard.writeText(sections.join('\n'));
    setShowToast(true);
  };

  const handleDownloadPDF = (consultation: Consultation) => {
    if (!patient) return;

    const pdfDataUri = generatePDF({
      report: {
        motivoVisita: consultation.motivo_visita || 'N.A.',
        storiaMedica: consultation.storia_medica || 'N.A.',
        storiaPonderale: consultation.storia_ponderale || 'N.A.',
        abitudiniAlimentari: consultation.abitudini_alimentari || 'N.A.',
        attivitaFisica: consultation.attivita_fisica || 'N.A.',
        fattoriPsi: consultation.fattori_psi || 'N.A.',
        esamiParametri: consultation.esami_parametri || 'N.A.',
        puntiCritici: consultation.punti_critici || 'N.A.',
        noteSpecialista: consultation.note_specialista || 'N.A.'
      },
      patientName: `${patient.first_name} ${patient.last_name}`,
      visitType: 'prima_visita'
    });

    const link = document.createElement('a');
    link.href = pdfDataUri;
    link.download = `referto_${patient.last_name.toLowerCase()}_${formatDate(consultation.created_at).replace(/\s/g, '_')}.pdf`;
    link.click();
  };

  const handlePrint = () => {
    if (!patient || !selectedConsultation) return;

    // Create print content
    const content = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Referto Medico</title>
          <style>
            @media print {
              body { 
                font-family: Arial, sans-serif;
                line-height: 1.6;
                color: #333;
                margin: 2cm;
              }
              h1 { 
                font-size: 24px;
                margin-bottom: 20px;
                color: #000;
              }
              .header { 
                margin-bottom: 30px;
                padding-bottom: 20px;
                border-bottom: 1px solid #eee;
              }
              .header p { 
                margin: 5px 0;
                font-size: 14px;
              }
              .section { 
                margin-bottom: 20px;
                page-break-inside: avoid;
              }
              .section h2 { 
                font-size: 16px;
                color: #444;
                margin-bottom: 10px;
                font-weight: bold;
              }
              .section p { 
                margin: 0;
                font-size: 14px;
              }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>Referto Medico</h1>
            <p>Paziente: ${patient.first_name} ${patient.last_name}</p>
            <p>Data: ${formatDate(selectedConsultation.created_at)}</p>
            <p>Tipo Visita: Prima Visita</p>
          </div>
          
          <div class="section">
            <h2>Motivo della Visita</h2>
            <p>${selectedConsultation.motivo_visita || 'Non specificato'}</p>
          </div>

          <div class="section">
            <h2>Storia Medica</h2>
            <p>${selectedConsultation.storia_medica || 'Non specificata'}</p>
          </div>

          <div class="section">
            <h2>Storia Ponderale</h2>
            <p>${selectedConsultation.storia_ponderale || 'Non specificata'}</p>
          </div>

          <div class="section">
            <h2>Abitudini Alimentari</h2>
            <p>${selectedConsultation.abitudini_alimentari || 'Non specificate'}</p>
          </div>

          <div class="section">
            <h2>Attività Fisica</h2>
            <p>${selectedConsultation.attivita_fisica || 'Non specificata'}</p>
          </div>

          <div class="section">
            <h2>Fattori Psicologici</h2>
            <p>${selectedConsultation.fattori_psi || 'Non specificati'}</p>
          </div>

          <div class="section">
            <h2>Esami e Parametri</h2>
            <p>${selectedConsultation.esami_parametri || 'Non specificati'}</p>
          </div>

          <div class="section">
            <h2>Punti Critici</h2>
            <p>${selectedConsultation.punti_critici || 'Non specificati'}</p>
          </div>

          <div class="section">
            <h2>Note dello Specialista</h2>
            <p>${selectedConsultation.note_specialista || 'Non specificate'}</p>
          </div>
        </body>
      </html>
    `;

    // Create a new iframe
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    document.body.appendChild(iframe);

    // Write content to iframe and print
    const doc = iframe.contentWindow?.document;
    if (doc) {
      doc.open();
      doc.write(content);
      doc.close();
      
      // Wait for content to load then print
      iframe.onload = () => {
        iframe.contentWindow?.print();
        // Remove iframe after printing
        setTimeout(() => {
          document.body.removeChild(iframe);
        }, 100);
      };
    }
  };

  const handleEdit = () => {
    if (selectedConsultation) {
      setSelectedConsultation({
        ...selectedConsultation,
        isEditing: true
      });
    }
  };

  const handleSave = async () => {
    if (!selectedConsultation) return;

    try {
      setSaving(true);
      setError(null);

      const { error: updateError } = await supabase
        .from('consultations')
        .update({
          motivo_visita: selectedConsultation.motivo_visita,
          storia_medica: selectedConsultation.storia_medica,
          storia_ponderale: selectedConsultation.storia_ponderale,
          abitudini_alimentari: selectedConsultation.abitudini_alimentari,
          attivita_fisica: selectedConsultation.attivita_fisica,
          fattori_psi: selectedConsultation.fattori_psi,
          esami_parametri: selectedConsultation.esami_parametri,
          punti_critici: selectedConsultation.punti_critici,
          note_specialista: selectedConsultation.note_specialista
        })
        .eq('id', selectedConsultation.id);

      if (updateError) throw updateError;

      setSelectedConsultation({
        ...selectedConsultation,
        isEditing: false
      });

      await loadPatientData();
    } catch (err) {
      const error = err as Error;
      setError(`Errore durante il salvataggio: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('it-IT', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('it-IT', {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const calculateAge = (birthDate: string) => {
    const today = new Date();
    const birth = new Date(birthDate);
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      age--;
    }
    
    return age;
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!patient) {
    return (
      <div className="p-6 bg-white">
        <div className="bg-red-50 p-4 rounded-lg flex items-center gap-2 text-red-700">
          <AlertCircle className="h-5 w-5" />
          <span>Paziente non trovato</span>
        </div>
      </div>
    );
  }

  return (
    <div className="container max-w-5xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={() => navigate('/app/patients')}
          className="flex items-center text-blue-600 hover:text-blue-800"
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          <span>Torna ai pazienti</span>
        </button>
        
        <div className="flex gap-2">
          <a
            href={`/app/new-consultation?patientId=${id}`}
            className="px-4 py-2 bg-green-600 text-white font-medium rounded-md hover:bg-green-700 flex items-center no-underline"
          >
            <PencilLine className="h-4 w-4 mr-2" />
            Nuova Consultazione
          </a>
          
          <button
            onClick={() => setIsEditing(true)}
            className="px-4 py-2 bg-gray-100 text-gray-700 font-medium rounded-md hover:bg-gray-200 flex items-center"
            disabled={isEditing}
          >
            <Edit className="h-4 w-4 mr-2" />
            Modifica
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 rounded-lg flex items-center gap-2 text-red-700">
          <AlertCircle className="h-5 w-5" />
          <span>{error}</span>
        </div>
      )}

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              <div className="h-16 w-16 bg-blue-100 rounded-full flex items-center justify-center">
                <User className="h-8 w-8 text-blue-600" />
              </div>
              {isEditing ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm text-gray-500">Nome</label>
                      <input
                        type="text"
                        value={editedPatient?.first_name || ''}
                        onChange={(e) => setEditedPatient(prev => prev ? {...prev, first_name: e.target.value} : null)}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-gray-500">Cognome</label>
                      <input
                        type="text"
                        value={editedPatient?.last_name || ''}
                        onChange={(e) => setEditedPatient(prev => prev ? {...prev, last_name: e.target.value} : null)}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-gray-500">Data di nascita</label>
                      <input
                        type="date"
                        value={editedPatient?.birth_date || ''}
                        onChange={(e) => setEditedPatient(prev => prev ? {...prev, birth_date: e.target.value} : null)}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-gray-500">Genere</label>
                      <select
                        value={editedPatient?.gender || ''}
                        onChange={(e) => setEditedPatient(prev => prev ? {...prev, gender: e.target.value} : null)}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                      >
                        <option value="male">Maschio</option>
                        <option value="female">Femmina</option>
                        <option value="other">Altro</option>
                        <option value="prefer_not_to_say">Preferisco non specificare</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm text-gray-500">Email</label>
                      <input
                        type="email"
                        value={editedPatient?.email || ''}
                        onChange={(e) => setEditedPatient(prev => prev ? {...prev, email: e.target.value} : null)}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-gray-500">Telefono</label>
                      <input
                        type="tel"
                        value={editedPatient?.phone || ''}
                        onChange={(e) => setEditedPatient(prev => prev ? {...prev, phone: e.target.value} : null)}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-gray-500">Peso (kg)</label>
                      <input
                        type="number"
                        step="0.1"
                        value={editedPatient?.weight || ''}
                        onChange={(e) => setEditedPatient(prev => prev ? {...prev, weight: parseFloat(e.target.value)} : null)}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-gray-500">Altezza (cm)</label>
                      <input
                        type="number"
                        step="0.1"
                        value={editedPatient?.height || ''}
                        onChange={(e) => setEditedPatient(prev => prev ? {...prev, height: parseFloat(e.target.value)} : null)}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm text-gray-500">Note</label>
                    <textarea
                      value={editedPatient?.notes || ''}
                      onChange={(e) => setEditedPatient(prev => prev ? {...prev, notes: e.target.value} : null)}
                      rows={3}
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                    />
                  </div>
                </div>
              ) : (
                <div>
                  <h1 className="text-2xl font-semibold text-gray-900">
                    {patient.first_name} {patient.last_name}
                  </h1>
                  <p className="text-gray-500">
                    {calculateAge(patient.birth_date)} anni • {
                      patient.gender === 'male' ? 'Maschio' :
                      patient.gender === 'female' ? 'Femmina' :
                      patient.gender === 'other' ? 'Altro' : 'Non specificato'
                    }
                  </p>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              {isEditing ? (
                <>
                  <button
                    onClick={handleSavePatient}
                    disabled={saving}
                    className="flex items-center gap-2 px-4 py-2 text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
                  >
                    {saving ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <Save className="h-5 w-5" />
                    )}
                    <span>Salva</span>
                  </button>
                  <button
                    onClick={() => {
                      setIsEditing(false);
                      setEditedPatient(patient);
                    }}
                    className="flex items-center gap-2 px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                  >
                    <X className="h-5 w-5" />
                    <span>Annulla</span>
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => setIsEditing(true)}
                    className="flex items-center gap-2 px-4 py-2 text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors"
                  >
                    <PencilLine className="h-5 w-5" />
                    <span>Modifica</span>
                  </button>
                  <button
                    onClick={() => setShowDeleteConfirm(true)}
                    className="flex items-center gap-2 px-4 py-2 text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    <Trash2 className="h-5 w-5" />
                    <span>Elimina</span>
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="flex items-center gap-3">
              <Calendar className="h-5 w-5 text-gray-400" />
              <div>
                <p className="text-sm text-gray-500">Data di nascita</p>
                <p className="text-gray-900">{formatDate(patient.birth_date)}</p>
              </div>
            </div>

            {patient.email && (
              <div className="flex items-center gap-3">
                <Mail className="h-5 w-5 text-gray-400" />
                <div>
                  <p className="text-sm text-gray-500">Email</p>
                  <p className="text-gray-900">{patient.email}</p>
                </div>
              </div>
            )}

            {patient.phone && (
              <div className="flex items-center gap-3">
                <Phone className="h-5 w-5 text-gray-400" />
                <div>
                  <p className="text-sm text-gray-500">Telefono</p>
                  <p className="text-gray-900">{patient.phone}</p>
                </div>
              </div>
            )}

            {patient.weight && (
              <div className="flex items-center gap-3">
                <Scale className="h-5 w-5 text-gray-400" />
                <div>
                  <p className="text-sm text-gray-500">Peso</p>
                  <p className="text-gray-900">{patient.weight} kg</p>
                </div>
              </div>
            )}

            {patient.height && (
              <div className="flex items-center gap-3">
                <Ruler className="h-5 w-5 text-gray-400" />
                <div>
                  <p className="text-sm text-gray-500">Altezza</p>
                  <p className="text-gray-900">{patient.height} cm</p>
                </div>
              </div>
            )}
          </div>

          {patient.notes && (
            <div className="mt-6">
              <h3 className="text-sm font-medium text-gray-500 mb-2">Note</h3>
              <p className="text-gray-900 whitespace-pre-wrap">{patient.notes}</p>
            </div>
          )}
        </div>

        <div className="p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-6">
            Storico Consultazioni
          </h2>

          <div className="space-y-6">
            {consultations.length === 0 ? (
              <p className="text-gray-500 text-center">
                Nessuna consultazione registrata per questo paziente.
              </p>
            ) : (
              consultations.map((consultation) => (
                <div
                  key={consultation.id}
                  className="bg-gray-50 rounded-lg p-6"
                >
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex items-center gap-3">
                      <FileText className="h-5 w-5 text-gray-400" />
                      <div>
                        <p className="text-sm text-gray-500">
                          {formatDate(consultation.created_at)}
                        </p>
                        <p className="text-gray-900">
                          {formatTime(consultation.created_at)}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="ml-8">
                    <h4 className="text-sm font-medium text-gray-700 mb-2">
                      Motivo della Visita
                    </h4>
                    <p className="text-gray-600">
                      {consultation.motivo_visita || 'Non specificato'}
                    </p>
                  </div>

                  <div className="mt-4 ml-8 flex gap-2">
                    <button 
                      onClick={() => setSelectedConsultation(consultation)}
                      className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                    >
                      Visualizza Referto Completo
                    </button>
                    {consultation.audio_url && (
                      <button 
                        onClick={() => window.open(consultation.audio_url!, '_blank')}
                        className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                      >
                        Scarica Audio
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {selectedConsultation && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h2 className="text-xl font-semibold text-gray-900">Referto Dettagliato</h2>
                  <p className="text-sm text-gray-500">
                    {formatDate(selectedConsultation.created_at)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                
                  {selectedConsultation.isEditing ? (
                    <button
                      onClick={handleSave}
                      disabled={saving}
                      className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
                    >
                      {saving ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Save className="h-4 w-4" />
                      )}
                      Salva
                    </button>
                  ) : (
                    <button
                      onClick={handleEdit}
                      className="flex items-center gap-2  px-3 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                    >
                      <Edit className="h-4 w-4" />
                      Modifica
                    </button>
                  )}
                  <button
                    onClick={() => handleCopyText(selectedConsultation)}
                    className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                    title="Copia referto"
                  >
                    <Copy className="h-5 w-5" />
                  </button>
                  <button
                    onClick={() => handleDownloadPDF(selectedConsultation)}
                    className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                    title="Scarica PDF"
                  >
                    <Download className="h-5 w-5" />
                  </button>
                  <button
                    onClick={handlePrint}
                    className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                    title="Stampa"
                  >
                    <Printer className="h-5 w-5" />
                  </button>
                  <button
                    onClick={() => setSelectedConsultation(null)}
                    className="p-2 text-gray-400 hover:text-gray-500"
                  >
                    <X className="h-6 w-6" />
                  </button>
                </div>
              </div>

              <div className="space-y-6">
                {[
                  ['Motivo della Visita', 'motivo_visita'],
                  ['Storia Medica', 'storia_medica'],
                  ['Storia Ponderale', 'storia_ponderale'],
                  ['Abitudini Alimentari', 'abitudini_alimentari'],
                  ['Attività Fisica', 'attivita_fisica'],
                  ['Fattori Psicologici', 'fattori_psi'],
                  ['Esami e Parametri', 'esami_parametri'],
                  ['Punti Critici', 'punti_critici'],
                  ['Note dello Specialista', 'note_specialista'],
                  ['Trascrizione', 'transcription']
                ].map(([title, field]) => (
                  <div key={field} className="border-b pb-4">
                    <h3 className="text-sm font-medium text-gray-700 mb-2">{title}</h3>
                    {selectedConsultation.isEditing && field !== 'transcription' ? (
                      <textarea
                        value={selectedConsultation[field as keyof Consultation] || ''}
                        onChange={(e) => setSelectedConsultation({
                          ...selectedConsultation,
                          [field]: e.target.value
                        })}
                        className="w-full p-2 border rounded-lg focus:ring-2  focus:ring-blue-500 focus:border-transparent"
                        rows={4}
                      />
                    ) : (
                      <p className="text-sm text-gray-600">
                        {selectedConsultation[field as keyof Consultation] || 'Non specificato'}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Conferma Eliminazione</h3>
            <p className="text-gray-600 mb-6">
              Sei sicuro di voler eliminare questo paziente? Questa azione eliminerà anche tutti i suoi referti e non può essere annullata.
            </p>
            <div className="flex justify-end gap-4">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                disabled={deleting}
              >
                Annulla
              </button>
              <button
                onClick={handleDeletePatient}
                className="flex items-center gap-2 px-4 py-2 text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
                disabled={deleting}
              >
                {deleting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Eliminazione in corso...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="h-4 w-4" />
                    <span>Elimina</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {showToast && (
        <Toast 
          message="Referto copiato negli appunti" 
          onClose={() => setShowToast(false)} 
        />
      )}
    </div>
  );
}