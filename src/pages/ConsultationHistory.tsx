import React, { useEffect, useState } from 'react';
import { FileText, Search, Calendar, User, Loader2, AlertCircle, X, Edit, Save, Printer, Download } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { generatePDF } from '../lib/pdfGenerator';

interface Patient {
  first_name: string;
  last_name: string;
  user_id: string;
}

interface Consultation {
  id: string;
  created_at: string;
  patient: Patient;
  motivo_visita: string;
  storia_medica: string;
  storia_ponderale: string;
  abitudini_alimentari: string;
  attivita_fisica: string;
  fattori_psi: string;
  esami_parametri: string;
  punti_critici: string;
  note_specialista: string;
  audio_url: string | null;
}

export function ConsultationHistory() {
  const { user } = useAuth();
  const [consultations, setConsultations] = useState<Consultation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedConsultation, setSelectedConsultation] = useState<Consultation | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editedConsultation, setEditedConsultation] = useState<Consultation | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (user) loadConsultations();
    // eslint-disable-next-line
  }, [user]);

  const loadConsultations = async () => {
    try {
      setLoading(true);
      setError(null);

      // 1. Prendi pazienti del dottore loggato
      const { data: patients, error: patientsError } = await supabase
        .from('patients')
        .select('id, first_name, last_name, user_id')
        .eq('user_id', user?.id);

      if (patientsError) throw patientsError;

      const patientIds = (patients ?? []).map((p) => p.id);
      if (patientIds.length === 0) {
        setConsultations([]);
        setLoading(false);
        return;
      }

      // 2. Prendi tutte le consultazioni dei loro pazienti
      const { data, error } = await supabase
        .from('consultations')
        .select(
          `
          id,
          created_at,
          audio_url,
          motivo_visita,
          storia_medica,
          storia_ponderale,
          abitudini_alimentari,
          attivita_fisica,
          fattori_psi,
          esami_parametri,
          punti_critici,
          note_specialista,
          patient:patient_id (
            first_name,
            last_name,
            user_id
          )
        `
        )
        .in('patient_id', patientIds)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // mappa dati sul formato desiderato
      const transformedData =
        data?.map((consultation) => ({
          ...consultation,
          patient: consultation.patient
        })) || [];

      setConsultations(transformedData);
    } catch (err) {
      const error = err as Error;
      setError(`Errore nel caricamento delle consultazioni: ${error.message}`);
      console.error('Errore nel caricamento delle consultazioni:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredConsultations = consultations.filter(consultation => {
    const searchLower = searchTerm.toLowerCase();
    return (
      consultation.patient.first_name.toLowerCase().includes(searchLower) ||
      consultation.patient.last_name.toLowerCase().includes(searchLower) ||
      consultation.motivo_visita?.toLowerCase().includes(searchLower)
    );
  });

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

  const handleEdit = () => {
    setIsEditing(true);
    setEditedConsultation(selectedConsultation);
  };

  const handleSave = async () => {
    if (!editedConsultation) return;
    
    try {
      setSaving(true);
      const { error } = await supabase
        .from('consultations')
        .update({
          motivo_visita: editedConsultation.motivo_visita,
          storia_medica: editedConsultation.storia_medica,
          storia_ponderale: editedConsultation.storia_ponderale,
          abitudini_alimentari: editedConsultation.abitudini_alimentari,
          attivita_fisica: editedConsultation.attivita_fisica,
          fattori_psi: editedConsultation.fattori_psi,
          esami_parametri: editedConsultation.esami_parametri,
          punti_critici: editedConsultation.punti_critici,
          note_specialista: editedConsultation.note_specialista
        })
        .eq('id', editedConsultation.id);

      if (error) throw error;

      setSelectedConsultation(editedConsultation);
      setIsEditing(false);
      await loadConsultations(); // Refresh the list
    } catch (err) {
      const error = err as Error;
      setError(`Errore durante il salvataggio: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPDF = () => {
    if (!selectedConsultation) return;

    const pdfDataUri = generatePDF({
      report: {
        motivoVisita: selectedConsultation.motivo_visita || 'N.A.',
        storiaMedica: selectedConsultation.storia_medica || 'N.A.',
        storiaPonderale: selectedConsultation.storia_ponderale || 'N.A.',
        abitudiniAlimentari: selectedConsultation.abitudini_alimentari || 'N.A.',
        attivitaFisica: selectedConsultation.attivita_fisica || 'N.A.',
        fattoriPsi: selectedConsultation.fattori_psi || 'N.A.',
        esamiParametri: selectedConsultation.esami_parametri || 'N.A.',
        puntiCritici: selectedConsultation.punti_critici || 'N.A.',
        noteSpecialista: selectedConsultation.note_specialista || 'N.A.'
      },
      patientName: `${selectedConsultation.patient.first_name} ${selectedConsultation.patient.last_name}`,
      visitType: 'prima_visita'
    });

    const link = document.createElement('a');
    link.href = pdfDataUri;
    link.download = `referto_${selectedConsultation.patient.last_name.toLowerCase()}_${formatDate(selectedConsultation.created_at).replace(/\s/g, '_')}.pdf`;
    link.click();
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center gap-2">
          <FileText className="h-6 w-6 text-blue-600" />
          <h1 className="text-2xl font-semibold text-gray-900">Storico Consultazioni</h1>
        </div>
        
        <div className="relative">
          <input
            type="text"
            placeholder="Cerca consultazioni..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <Search className="h-5 w-5 text-gray-400 absolute left-3 top-1/2 transform -translate-y-1/2" />
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 rounded-lg flex items-center gap-2 text-red-700">
          <AlertCircle className="h-5 w-5" />
          <span>{error}</span>
        </div>
      )}

      <div className="bg-white rounded-lg shadow overflow-hidden">
        {loading ? (
          <div className="p-8 flex justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          </div>
        ) : filteredConsultations.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            {searchTerm ? 'Nessuna consultazione trovata.' : 'Nessuna consultazione registrata.'}
          </div>
        ) : (
          <div className="min-w-full divide-y divide-gray-200">
            {filteredConsultations.map((consultation) => (
              <div
                key={consultation.id}
                className="p-6 hover:bg-gray-50 transition-colors"
              >
                <div className="flex justify-between items-start mb-4">
                  <div className="flex items-center gap-3">
                    <User className="h-5 w-5 text-gray-400" />
                    <div>
                      <h3 className="text-lg font-medium text-gray-900">
                        {consultation.patient.first_name} {consultation.patient.last_name}
                      </h3>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <Calendar className="h-4 w-4" />
                    <span>{formatDate(consultation.created_at)}</span>
                    <span>{formatTime(consultation.created_at)}</span>
                  </div>
                </div>
                
                <div className="ml-8">
                  <h4 className="text-sm font-medium text-gray-700 mb-2">Motivo della Visita</h4>
                  <p className="text-sm text-gray-600">{consultation.motivo_visita || 'Non specificato'}</p>
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
            ))}
          </div>
        )}
      </div>

      {selectedConsultation && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-start mb-6">
                <h2 className="text-xl font-semibold text-gray-900">Referto Dettagliato</h2>
                <div className="flex items-center gap-2">
                  {isEditing ? (
                    <button
                      onClick={handleSave}
                      disabled={saving}
                      className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
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
                      className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                    >
                      <Edit className="h-4 w-4" />
                      Modifica
                    </button>
                  )}
                  <button
                    onClick={handlePrint}
                    className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                  >
                    <Printer className="h-4 w-4" />
                    Stampa
                  </button>
                  <button
                    onClick={handleDownloadPDF}
                    className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                  >
                    <Download className="h-4 w-4" />
                    PDF
                  </button>
                  <button
                    onClick={() => {
                      setSelectedConsultation(null);
                      setIsEditing(false);
                      setEditedConsultation(null);
                    }}
                    className="text-gray-400 hover:text-gray-500"
                  >
                    <X className="h-6 w-6" />
                  </button>
                </div>
              </div>

              <div className="space-y-6">
                {Object.entries({
                  'Motivo della Visita': isEditing ? editedConsultation?.motivo_visita : selectedConsultation.motivo_visita,
                  'Storia Medica': isEditing ? editedConsultation?.storia_medica : selectedConsultation.storia_medica,
                  'Storia Ponderale': isEditing ? editedConsultation?.storia_ponderale : selectedConsultation.storia_ponderale,
                  'Abitudini Alimentari': isEditing ? editedConsultation?.abitudini_alimentari : selectedConsultation.abitudini_alimentari,
                  'Attività Fisica': isEditing ? editedConsultation?.attivita_fisica : selectedConsultation.attivita_fisica,
                  'Fattori Psicologici': isEditing ? editedConsultation?.fattori_psi : selectedConsultation.fattori_psi,
                  'Esami e Parametri': isEditing ? editedConsultation?.esami_parametri : selectedConsultation.esami_parametri,
                  'Punti Critici': isEditing ? editedConsultation?.punti_critici : selectedConsultation.punti_critici,
                  'Note dello Specialista': isEditing ? editedConsultation?.note_specialista : selectedConsultation.note_specialista,
                }).map(([title, content]) => (
                  <div key={title} className="border-b pb-4">
                    <h3 className="text-sm font-medium text-gray-700 mb-2">{title}</h3>
                    {isEditing ? (
                      <textarea
                        value={content || ''}
                        onChange={(e) => {
                          if (!editedConsultation) return;
                          const field = title.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z_]/g, '');
                          setEditedConsultation({
                            ...editedConsultation,
                            [field]: e.target.value
                          });
                        }}
                        className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        rows={4}
                      />
                    ) : (
                      <p className="text-sm text-gray-600">{content || 'Non specificato'}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}