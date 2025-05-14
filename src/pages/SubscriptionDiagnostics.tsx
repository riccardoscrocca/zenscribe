import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { fixConsultationIssue } from '../utils/diagnostics';

export function SubscriptionDiagnostics() {
  const { user } = useAuth();
  const [isLoadingRole, setIsLoadingRole] = useState(true);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isFixingConsultation, setIsFixingConsultation] = useState(false);
  const [fixResult, setFixResult] = useState('');

  useEffect(() => {
    checkUserRole();
  }, [user]);

  const checkUserRole = async () => {
    if (!user) {
      setUserRole(null);
      setIsLoadingRole(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('users')
        .select('role')
        .eq('id', user.id)
        .single();

      if (error) throw error;

      setUserRole(data?.role || null);
    } catch (error) {
      console.error('Error checking user role:', error);
      setErrorMessage('Errore nel controllo del ruolo utente');
    } finally {
      setIsLoadingRole(false);
    }
  };

  const handleFixConsultationIssue = async () => {
    setIsFixingConsultation(true);
    setFixResult('');
    
    try {
      const result = await fixConsultationIssue();
      
      if (result.success) {
        setFixResult('Riparazione completata con successo. Ora dovresti poter salvare le consultazioni.');
      } else {
        setFixResult('Errore nella riparazione: ' + (result.error instanceof Error ? result.error.message : String(result.error)));
      }
    } catch (error) {
      console.error('Fix consultation issue error:', error);
      setFixResult('Errore: ' + (error instanceof Error ? error.message : String(error)));
    } finally {
      setIsFixingConsultation(false);
    }
  };

  if (isLoadingRole) {
    return (
      <div className="text-center py-8">
        <p>Caricamento...</p>
      </div>
    );
  }

  if (userRole !== 'admin') {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-4">Accesso negato</h1>
        <p>Solo gli amministratori possono accedere a questa pagina.</p>
      </div>
    );
  }

  // Se siamo qui, l'utente è un admin
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Diagnostica Sottoscrizioni</h1>
      
      {errorMessage && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {errorMessage}
        </div>
      )}
      
      <div className="mb-6">
        <div className="bg-blue-50 p-4 rounded-lg mb-4">
          <h2 className="text-lg font-semibold mb-2">Risolvi errore "user_id" durante la creazione consultazioni</h2>
          <p className="mb-4">
            Questo strumento corregge l'errore nel trigger SQL che aggiorna i minuti, che sta causando problemi durante il salvataggio delle consultazioni.
          </p>
          
          <button 
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            onClick={handleFixConsultationIssue}
            disabled={isFixingConsultation}
          >
            {isFixingConsultation ? 'Riparazione in corso...' : 'Ripara Errore Consultazioni'}
          </button>
          
          {fixResult && (
            <div className={`mt-4 p-3 rounded ${fixResult.includes('Errore') ? 'bg-red-100' : 'bg-green-100'}`}>
              {fixResult}
            </div>
          )}
        </div>
      </div>

      <div className="mt-6">
        <button 
          onClick={() => window.history.back()}
          className="px-4 py-2 border border-gray-300 rounded hover:bg-gray-100"
        >
          Torna indietro
        </button>
      </div>
    </div>
  );
}
