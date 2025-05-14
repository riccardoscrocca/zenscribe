import React, { useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { AlertCircle, Loader2, ArrowLeft, Bot as Lotus, UserPlus } from 'lucide-react';

export function Login() {
  const [isRegistering, setIsRegistering] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isResettingPassword, setIsResettingPassword] = useState(false);

  const { user, signIn, signUp, resetPassword } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const isRecoveryFlow = searchParams.get('type') === 'recovery';

  if (isRecoveryFlow) {
    return <Navigate to="/reset-password" replace />;
  }

  if (user) {
    return <Navigate to="/app" replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setIsLoading(true);

    try {
      if (isRegistering) {
        if (password !== confirmPassword) {
          setError('Le password non coincidono');
          setIsLoading(false);
          return;
        }

        if (!fullName || fullName.trim().length < 2) {
          setError('Per favore inserisci il tuo nome completo');
          setIsLoading(false);
          return;
        }

        // Registrazione con creazione automatica di abbonamento Free
        console.log('Tentativo di registrazione per:', email.substring(0, 3) + '***');
        
        try {
          const { data, error: signUpError } = await signUp(email, password, fullName);
          
          if (signUpError) {
            console.error('Errore registrazione:', signUpError);
            setError(signUpError);
          } else if (data) {
            console.log('Registrazione completata, reindirizzamento...');
            // Mostro messaggio di benvenuto prima del redirect
            setMessage('Registrazione completata! Benvenuto in Zenscribe.ai');
            setTimeout(() => {
              navigate('/app');
            }, 1500);
          }
        } catch (registerError) {
          console.error('Eccezione durante la registrazione:', registerError);
          setError('Si è verificato un errore imprevisto. Per favore riprova più tardi.');
        }
      } else {
        console.log('Tentativo di login per:', email.substring(0, 3) + '***');
        
        try {
          // Utilizziamo direttamente il contesto di autenticazione per il login
          const { data, error: signInError } = await signIn(email, password);
          
          console.log('Risultato login:', {
            success: !signInError,
            hasData: !!data,
            hasSession: !!(data && data.session)
          });
          
          if (signInError) {
            console.error('Errore login:', signInError);
            setError(signInError);
          } else if (data && data.session) {
            console.log('Login riuscito, reindirizzamento...');
            // Login riuscito, redirigiamo alla dashboard
            navigate('/app');
          } else {
            console.error('Login anomalo: nessun errore ma sessione non valida');
            setError('Errore durante il login. Per favore riprova più tardi.');
          }
        } catch (loginError) {
          console.error('Eccezione durante il login:', loginError);
          setError('Si è verificato un errore imprevisto. Per favore riprova più tardi.');
        }
      }
    } catch (err: any) {
      console.error('Auth error:', err);
      setError(err.message || 'Si è verificato un errore. Riprova più tardi.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!email) {
      setError('Inserisci il tuo indirizzo email per reimpostare la password');
      return;
    }

    setIsLoading(true);
    setError('');
    setMessage('');

    try {
      // Utilizziamo il resetPassword dal contesto di autenticazione
      const { error } = await resetPassword(email);
      if (error) {
        setError(error);
        return;
      }
      
      setMessage("Se l'indirizzo email esiste, riceverai le istruzioni per reimpostare la password.");
      setIsResettingPassword(false);
    } catch (err: any) {
      setError(err.message || "Errore durante l'invio dell'email di reset.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-teal-50 to-white flex flex-col items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full">
        <div className="text-center">
          <div className="flex items-center justify-center gap-3 mb-6">
            <Lotus className="h-12 w-12 text-teal-600" />
            <h1 className="text-4xl font-bold">
              <span className="text-teal-600">Zen</span>
              <span className="text-gray-700">Scribe</span>
              <span className="text-gray-500">.ai</span>
            </h1>
          </div>
          
          {!isResettingPassword && (
            <div className="mb-6">
              <div className="flex justify-center items-center space-x-4 mb-2">
                <button
                  onClick={() => setIsRegistering(false)}
                  className={`px-6 py-3 text-base font-medium rounded-t-lg transition ${!isRegistering 
                    ? 'bg-teal-600 text-white' 
                    : 'bg-gray-200 text-gray-600 hover:bg-gray-300'}`}
                >
                  Accedi
                </button>
                <button
                  onClick={() => setIsRegistering(true)}
                  className={`px-6 py-3 text-base font-medium rounded-t-lg transition ${isRegistering 
                    ? 'bg-teal-600 text-white' 
                    : 'bg-gray-200 text-gray-600 hover:bg-gray-300'}`}
                >
                  Registrati
                </button>
              </div>
              
              <h2 className="text-2xl font-bold text-gray-900">
                {isRegistering ? 'Crea il tuo account' : 'Accedi al tuo account'}
              </h2>
              
              {isRegistering && (
                <p className="mt-2 text-gray-600 italic">
                  Inizia subito con il piano Free e ottieni 30 minuti di trascrizione al mese
                </p>
              )}
            </div>
          )}
          
          {isResettingPassword && (
            <h2 className="text-3xl font-extrabold text-gray-900 mb-4">
              Reimposta la tua password
            </h2>
          )}
        </div>

        <form className="mt-2 space-y-6" onSubmit={handleSubmit}>
          {error && (
            <div className="rounded-md bg-red-50 p-4 flex items-start">
              <AlertCircle className="w-5 h-5 text-red-400 mt-0.5 mr-2" />
              <div className="text-sm text-red-700">{error}</div>
            </div>
          )}
          {message && (
            <div className="rounded-md bg-green-50 p-4">
              <div className="text-sm text-green-700">{message}</div>
            </div>
          )}

          <div className="space-y-4">
            {isRegistering && (
              <div>
                <label htmlFor="full-name" className="text-sm font-medium text-gray-700 block mb-1">
                  Nome completo
                </label>
                <input
                  id="full-name"
                  name="full-name"
                  type="text"
                  required
                  className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-teal-500 focus:border-teal-500 sm:text-sm"
                  placeholder="Nome e Cognome"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                />
              </div>
            )}

            <div>
              <label htmlFor="email-address" className="text-sm font-medium text-gray-700 block mb-1">
                Email
              </label>
              <input
                id="email-address"
                name="email"
                type="email"
                autoComplete="email"
                required
                className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-teal-500 focus:border-teal-500 sm:text-sm"
                placeholder="nome@esempio.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            {!isResettingPassword && (
              <div>
                <div className="flex justify-between">
                  <label htmlFor="password" className="text-sm font-medium text-gray-700 block mb-1">
                    Password
                  </label>
                  {!isRegistering && (
                    <button
                      type="button"
                      onClick={() => setIsResettingPassword(true)}
                      className="text-xs font-medium text-teal-600 hover:text-teal-500"
                    >
                      Password dimenticata?
                    </button>
                  )}
                </div>
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete={isRegistering ? 'new-password' : 'current-password'}
                  required
                  className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-teal-500 focus:border-teal-500 sm:text-sm"
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={6}
                />
              </div>
            )}

            {isRegistering && (
              <div>
                <label htmlFor="confirm-password" className="text-sm font-medium text-gray-700 block mb-1">
                  Conferma password
                </label>
                <input
                  id="confirm-password"
                  name="confirm-password"
                  type="password"
                  autoComplete="new-password"
                  required
                  className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-teal-500 focus:border-teal-500 sm:text-sm"
                  placeholder="Ripeti password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  minLength={6}
                />
              </div>
            )}
          </div>

          <div className="flex flex-col gap-4">
            {isResettingPassword ? (
              <>
                <button
                  type="button"
                  onClick={handleResetPassword}
                  disabled={isLoading}
                  className={`group relative w-full flex justify-center py-3 px-4 border border-transparent text-sm font-medium rounded-md text-white ${isLoading ? 'bg-teal-400 cursor-not-allowed' : 'bg-teal-600 hover:bg-teal-700'} focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-teal-500`}
                >
                  {isLoading ? (
                    <div className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Invio in corso...</span>
                    </div>
                  ) : (
                    'Invia Email di Reset'
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setIsResettingPassword(false)}
                  className="text-teal-600 hover:text-teal-500 flex items-center justify-center gap-1"
                >
                  <ArrowLeft className="h-4 w-4" />
                  <span>Torna al login</span>
                </button>
              </>
            ) : (
              <button
                type="submit"
                disabled={isLoading}
                className={`group relative w-full flex justify-center py-3 px-4 border border-transparent text-sm font-medium rounded-md text-white ${isLoading ? 'bg-teal-400 cursor-not-allowed' : 'bg-teal-600 hover:bg-teal-700'} focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-teal-500`}
              >
                {isLoading ? (
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>{isRegistering ? 'Registrazione...' : 'Accesso in corso...'}</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    {isRegistering && <UserPlus className="h-4 w-4" />}
                    <span>{isRegistering ? 'Crea account gratuito' : 'Accedi'}</span>
                  </div>
                )}
              </button>
            )}
          </div>
        </form>
        
        <div className="text-center mt-6 flex flex-col gap-2">
          <a 
            href="/login-diagnostico" 
            className="text-xs text-gray-500 hover:text-gray-700"
          >
            Modalità diagnostica
          </a>
          
          <button 
            onClick={() => {
              console.log('Test connessione Supabase...');
              import('../lib/supabase').then(({ supabase }) => {
                console.log('Supabase importato');
                supabase.auth.getSession().then((response) => {
                  console.log('Test getSession:', response);
                  setMessage('Test Supabase completato. Controlla la console per dettagli.');
                }).catch(err => {
                  console.error('Errore test Supabase:', err);
                  setError('Errore durante il test Supabase: ' + err.message);
                });
              }).catch(err => {
                console.error('Errore importazione Supabase:', err);
                setError('Errore importazione modulo Supabase: ' + err.message);
              });
            }}
            className="text-xs text-blue-500 hover:text-blue-700"
          >
            Test connessione Supabase
          </button>
        </div>
      </div>
    </div>
  );
}
