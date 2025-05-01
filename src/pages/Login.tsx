import React, { useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { AlertCircle, Loader2, ArrowLeft, Bot as Lotus } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { resetPassword } from '../lib/auth';

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

  const { user, signIn } = useAuth();
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
          return;
        }

        const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: fullName }
          }
        });

        if (signUpError) throw signUpError;

        const { error: profileError } = await supabase
          .from('users')
          .insert([{
            id: signUpData.user?.id,
            email,
            full_name: fullName,
            role: 'doctor',
            subscription_tier: 'free'
          }]);

        if (profileError) throw profileError;

        setMessage('Account creato con successo! Effettua il login per continuare.');
        setIsRegistering(false);
      } else {
        const { error: signInError } = await signIn(email, password);
        if (signInError) setError(signInError);
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
      const { error } = await resetPassword(email);
      if (error) throw error;
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
            {isResettingPassword ? 'Reimposta la tua password' : isRegistering ? 'Crea il tuo account' : 'Accedi al tuo account'}
          </h2>

          {!isRegistering && !isResettingPassword && (
            <p className="mt-2 text-sm text-gray-600">
              Non hai un account?{' '}
              <button
                onClick={() => setIsRegistering(true)}
                className="font-medium text-teal-600 hover:text-teal-500"
              >
                Registrati
              </button>
            </p>
          )}

          {isRegistering && (
            <p className="mt-2 text-sm text-gray-600">
              Hai già un account?{' '}
              <button
                onClick={() => setIsRegistering(false)}
                className="font-medium text-teal-600 hover:text-teal-500"
              >
                Accedi
              </button>
            </p>
          )}
        </div>

        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
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

          <div className="rounded-md shadow-sm -space-y-px">
            {isRegistering && (
              <div className="mb-4">
                <input
                  id="full-name"
                  name="full-name"
                  type="text"
                  required
                  className="appearance-none block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-t-md focus:outline-none focus:ring-teal-500 focus:border-teal-500 sm:text-sm"
                  placeholder="Nome Completo"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                />
              </div>
            )}

            <div>
              <input
                id="email-address"
                name="email"
                type="email"
                autoComplete="email"
                required
                className={`appearance-none block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 ${isRegistering ? '' : 'rounded-t-md'} focus:outline-none focus:ring-teal-500 focus:border-teal-500 sm:text-sm`}
                placeholder="Indirizzo Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            {!isResettingPassword && (
              <div>
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete={isRegistering ? 'new-password' : 'current-password'}
                  required
                  className={`appearance-none block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 ${isRegistering ? '' : 'rounded-b-md'} focus:outline-none focus:ring-teal-500 focus:border-teal-500 sm:text-sm`}
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            )}

            {isRegistering && (
              <div>
                <input
                  id="confirm-password"
                  name="confirm-password"
                  type="password"
                  autoComplete="new-password"
                  required
                  className="appearance-none block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-b-md focus:outline-none focus:ring-teal-500 focus:border-teal-500 sm:text-sm"
                  placeholder="Conferma Password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
              </div>
            )}
          </div>

          {!isRegistering && !isResettingPassword && (
            <div className="flex items-center justify-end">
              <button
                type="button"
                onClick={() => setIsResettingPassword(true)}
                className="text-sm font-medium text-teal-600 hover:text-teal-500"
              >
                Password dimenticata?
              </button>
            </div>
          )}

          <div className="flex flex-col gap-4">
            {isResettingPassword ? (
              <>
                <button
                  type="button"
                  onClick={handleResetPassword}
                  disabled={isLoading}
                  className={`group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white ${isLoading ? 'bg-teal-400 cursor-not-allowed' : 'bg-teal-600 hover:bg-teal-700'} focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-teal-500`}
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
                  onClick={() => {
                    setIsResettingPassword(false);
                    setError('');
                    setMessage('');
                  }}
                  className="flex items-center justify-center gap-2 text-sm text-gray-600 hover:text-gray-500"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Torna al login
                </button>
              </>
            ) : (
              <button
                type="submit"
                disabled={isLoading}
                className={`group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white ${isLoading ? 'bg-teal-400 cursor-not-allowed' : 'bg-teal-600 hover:bg-teal-700'} focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-teal-500`}
              >
                {isLoading ? (
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>{isRegistering ? 'Registrazione in corso...' : 'Accesso in corso...'}</span>
                  </div>
                ) : (
                  isRegistering ? 'Registrati' : 'Accedi'
                )}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
