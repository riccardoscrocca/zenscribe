import React, { useState, useEffect } from 'react';
import { X, Shield, Cookie } from 'lucide-react';

export function PrivacyBanner() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    // Check if user has already accepted
    const accepted = localStorage.getItem('privacy-accepted');
    if (!accepted) {
      setShow(true);
    }
  }, []);

  const handleAccept = () => {
    localStorage.setItem('privacy-accepted', 'true');
    setShow(false);
  };

  if (!show) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-lg z-50">
      <div className="max-w-7xl mx-auto p-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-start gap-3 flex-grow">
            <Cookie className="h-5 w-5 text-blue-600 flex-shrink-0 mt-1" />
            <p className="text-sm text-gray-600">
              Utilizziamo i cookie per migliorare la tua esperienza sul nostro sito. Alcuni sono necessari per il funzionamento del sito, mentre altri ci aiutano a capire come interagisci con esso.{' '}
              <a href="/privacy" className="text-blue-600 hover:text-blue-700 underline">
                Leggi la nostra Privacy Policy
              </a>
            </p>
          </div>
          <div className="flex items-center gap-4 ml-8">
            <button
              onClick={handleAccept}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
            >
              Accetta tutti
            </button>
            <button
              onClick={() => setShow(false)}
              className="text-gray-400 hover:text-gray-500"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}