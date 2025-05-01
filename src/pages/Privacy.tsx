import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, ArrowLeft } from 'lucide-react';

export function Privacy() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <button
                onClick={() => navigate(-1)}
                className="text-gray-600 hover:text-gray-900 flex items-center gap-2"
              >
                <ArrowLeft className="h-5 w-5" />
                <span>Indietro</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="bg-white rounded-lg shadow-sm p-8">
          <div className="flex items-center gap-3 mb-8">
            <Shield className="h-8 w-8 text-blue-600" />
            <h1 className="text-3xl font-bold text-gray-900">Privacy Policy</h1>
          </div>

          <div className="prose max-w-none">
            <p className="text-gray-600 mb-6">
              Ultimo aggiornamento: {new Date().toLocaleDateString('it-IT')}
            </p>

            <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-4">1. Introduzione</h2>
            <p className="text-gray-600 mb-4">
              La presente Privacy Policy descrive le modalità con cui ZenScribe Ai ("noi", "nostro" o "ZenScribe Ai") raccoglie, utilizza e protegge i dati personali degli utenti che utilizzano il nostro servizio.
            </p>

            <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-4">2. Dati raccolti</h2>
            <p className="text-gray-600 mb-4">
              Raccogliamo i seguenti tipi di dati:
            </p>
            <ul className="list-disc pl-6 mb-4 text-gray-600">
              <li>Dati di registrazione (nome, email, password)</li>
              <li>Dati dei pazienti (con il loro consenso esplicito)</li>
              <li>Registrazioni audio delle consultazioni</li>
              <li>Trascrizioni e report generati</li>
              <li>Dati di utilizzo del servizio</li>
            </ul>

            <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-4">3. Utilizzo dei dati</h2>
            <p className="text-gray-600 mb-4">
              Utilizziamo i dati raccolti per:
            </p>
            <ul className="list-disc pl-6 mb-4 text-gray-600">
              <li>Fornire e migliorare il servizio</li>
              <li>Generare trascrizioni e report</li>
              <li>Gestire gli abbonamenti</li>
              <li>Comunicare con gli utenti</li>
              <li>Garantire la sicurezza del servizio</li>
            </ul>

            <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-4">4. Cookie</h2>
            <p className="text-gray-600 mb-4">
              Utilizziamo i seguenti tipi di cookie:
            </p>
            <ul className="list-disc pl-6 mb-4 text-gray-600">
              <li>Cookie tecnici necessari</li>
              <li>Cookie analitici (con IP anonimizzato)</li>
              <li>Cookie di preferenze</li>
            </ul>

            <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-4">5. Conservazione dei dati</h2>
            <p className="text-gray-600 mb-4">
              Conserviamo i dati personali per il tempo necessario a fornire il servizio e rispettare gli obblighi di legge. I dati dei pazienti vengono conservati secondo le normative sanitarie vigenti.
            </p>

            <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-4">6. Diritti degli interessati</h2>
            <p className="text-gray-600 mb-4">
              Gli utenti hanno il diritto di:
            </p>
            <ul className="list-disc pl-6 mb-4 text-gray-600">
              <li>Accedere ai propri dati</li>
              <li>Rettificare i dati inesatti</li>
              <li>Cancellare i dati</li>
              <li>Limitare il trattamento</li>
              <li>Portabilità dei dati</li>
              <li>Opporsi al trattamento</li>
            </ul>

            <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-4">7. Sicurezza</h2>
            <p className="text-gray-600 mb-4">
              Adottiamo misure di sicurezza tecniche e organizzative per proteggere i dati personali, inclusa la crittografia end-to-end per le registrazioni audio e i dati sensibili.
            </p>

            <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-4">8. Contatti</h2>
            <p className="text-gray-600 mb-4">
              Per qualsiasi domanda sulla privacy, contattare:
              <br />
              Email: privacy@ZenScribe.Ai
              <br />
              Indirizzo: via Attilio Friggeri 184, 00136, Roma
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}