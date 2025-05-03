import React, { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { AlertCircle, Loader2, Bot as Lotus } from 'lucide-react';
import { signInWithEmailSimple } from '../lib/auth-fix';

export function LoginSimple() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [debugInfo, setDebugInfo] = useState<any>(null);

  const { user } = useAuth();
  const navigate = useNavigate();

  if (user) {
    return <Navigate to="/app" replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setDebugInfo(null);
    setIsLoading(true);

    try {
      // Utilizziamo la versione semplificata dell'autenticazione
      const result = await signInWithEmailSimple(email, password);
      
      setDebugInfo(result);
      
      if (result.error) {
        setError(result.error);
      } else if (result.data) {
        // Login riuscito, ma non facciamo redirect automatico
        // Mostriamo invece le informazioni di debug
        console.log('Login riuscito:', result.data);
        
        // Facciamo un check manuale per verificare se l'utente esiste nella tabella users
        const userId = result.data.session.user.id;
        
        // Otteniamo il token dalla sessione (potrebbe avere struttura diversa)
        const accessToken = (result.data.session as any).access_token || 
                          (result.data.session as any).session?.access_token;
        
        if (accessToken) {
          try {
            const { data: userData, error: userError } = await fetch(
              `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/users?id=eq.${userId}`,
              {
                headers: {
                  'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
                  'Authorization': `Bearer ${accessToken}`
                }
              }
            ).then(res => res.json());
            
            setDebugInfo((prevInfo: any) => ({
              ...prevInfo,
              userCheck: { data: userData, error: userError }
            }));
          } catch (fetchErr) {
            setDebugInfo((prevInfo: any) => ({
              ...prevInfo,
              userCheck: { error: fetchErr }
            }));
          }
        }
      }
    } catch (err: any) {
      console.error('Auth error:', err);
      setError(err.message || 'Si è verificato un errore. Riprova più tardi.');
      setDebugInfo({ error: err });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-teal-50 to-white flex flex-col items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <div className="flex items-center justify-center gap-3 mb-6">
            <Lotus className="h-12 w-12 text-teal-600" />
            <h1 className="text-4xl font-bold">
              <span className="text-teal-600">Zen</span>
              <span className="text-gray-700">Scribe</span>
              <span className="text-gray-500">.ai</span>
            </h1>
          </div>
          <h2 className="text-3xl font-extrabold text-gray-900">
            Login Diagnostico
          </h2>
        </div>

        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          {error && (
            <div className="rounded-md bg-red-50 p-4 flex items-start">
              <AlertCircle className="w-5 h-5 text-red-400 mt-0.5 mr-2" />
              <div className="text-sm text-red-700">{error}</div>
            </div>
          )}

          <div className="rounded-md shadow-sm -space-y-px">
            <div>
              <input
                id="email-address"
                name="email"
                type="email"
                autoComplete="email"
                required
                className="appearance-none block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-t-md focus:outline-none focus:ring-teal-500 focus:border-teal-500 sm:text-sm"
                placeholder="Indirizzo Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                className="appearance-none block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-b-md focus:outline-none focus:ring-teal-500 focus:border-teal-500 sm:text-sm"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={isLoading}
              className={`group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white ${isLoading ? 'bg-teal-400 cursor-not-allowed' : 'bg-teal-600 hover:bg-teal-700'} focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-teal-500`}
            >
              {isLoading ? (
                <div className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Accesso in corso...</span>
                </div>
              ) : (
                'Accedi (Diagnostica)'
              )}
            </button>
          </div>
        </form>

        {debugInfo && (
          <div className="mt-6 p-4 bg-gray-50 rounded-lg border border-gray-200 overflow-x-auto">
            <h3 className="text-sm font-medium text-gray-900 mb-2">Informazioni di Debug:</h3>
            <pre className="text-xs text-gray-700 whitespace-pre-wrap">
              {JSON.stringify(debugInfo, null, 2)}
            </pre>
          </div>
        )}
        
        <div className="text-center mt-4">
          <a href="/login" className="text-sm text-teal-600 hover:text-teal-500">
            Torna al login normale
          </a>
        </div>
      </div>
    </div>
  );
}

export default LoginSimple; 