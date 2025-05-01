import React from 'react';
import { FileText, Construction } from 'lucide-react';

export function Orders() {
  return (
    <div className="min-h-screen bg-white p-6">
      <div className="max-w-4xl mx-auto text-center">
        <div className="flex flex-col items-center justify-center gap-4 p-8">
          <Construction className="h-16 w-16 text-blue-600" />
          <h1 className="text-3xl font-bold text-gray-900">Pagina in Sviluppo</h1>
          <p className="text-xl text-gray-600">
            La sezione Ordini & Risultati è attualmente in fase di sviluppo. 
            Sarà presto disponibile con nuove funzionalità.
          </p>
        </div>
      </div>
    </div>
  );
}