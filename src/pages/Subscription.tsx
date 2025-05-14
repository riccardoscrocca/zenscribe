import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { getSubscriptionStatus } from '../lib/subscriptions';
import { STRIPE_PRODUCTS } from '../lib/stripe-config';
import { requestPlanChange } from '../lib/subscription-client';
import {
  Clock, 
  FileText, 
  Star, 
  Building, 
  Check,
  Zap,
  CreditCard,
  ChevronRight,
  Sparkles,
  Loader2,
  Mail,
  Settings,
  AlertCircle
} from 'lucide-react';

interface SubscriptionStatus {
  minutesUsed: number;
  monthlyMinutes: number;
  minutesRemaining: number;
  plan: string;
  price: number;
}

const FEATURES = {
  Free: [
    'Fino a 30 minuti di registrazione al mese',
    'Trascrizione automatica',
    'Report medici in PDF',
    'Accesso a 1 utente'
  ],
  Basic: [
    'Fino a 600 minuti di registrazione al mese',
    'Trascrizione automatica',
    'Report medici in PDF',
    'Accesso per 1 utente',
    'Esportazione dati',
    'Backup automatico',
    '7 giorni di prova gratuita'
  ],
  Advanced: [
    'Fino a 1200 minuti di registrazione al mese',
    'Trascrizione automatica',
    'Report medici in PDF',
    'Accesso a 5 utenti',
    'Supporto email e telefonico prioritario',
    'Esportazione dati avanzata',
    'Backup automatico',
    'Dashboard analytics'
  ],
  Enterprise: [
    'Minuti di registrazione illimitati',
    'Trascrizione automatica',
    'Report medici in PDF personalizzabili',
    'Utenti illimitati',
    'Account manager dedicato',
    'Supporto prioritario 24/7',
    'Branding personalizzato',
    'Dashboard analytics avanzato',
    'Integrazione sistemi esistenti',
    'Training personalizzato'
  ]
};

const PLAN_ICONS = {
  Free: Clock,
  Basic: FileText,
  Advanced: Star,
  Enterprise: Building
};

const PLAN_PRICES = {
  Free: 0,
  Basic: STRIPE_PRODUCTS.BASIC.price,
  Advanced: STRIPE_PRODUCTS.ADVANCED.price,
  Enterprise: null // Contact us
};

const PLAN_COLORS = {
  Free: {
    bg: 'bg-gradient-to-br from-gray-50 to-gray-100',
    border: 'border-gray-200',
    text: 'text-gray-600',
    icon: 'text-gray-400 bg-gray-100',
    button: 'bg-gray-100 text-gray-600 hover:bg-gray-200'
  },
  Basic: {
    bg: 'bg-gradient-to-br from-white to-blue-50',
    border: 'border-blue-200',
    text: 'text-blue-600',
    icon: 'text-blue-500 bg-blue-100',
    button: 'bg-blue-600 hover:bg-blue-700 text-white'
  },
  Advanced: {
    bg: 'bg-gradient-to-br from-white to-purple-50',
    border: 'border-purple-200',
    text: 'text-purple-600',
    icon: 'text-purple-500 bg-purple-100',
    button: 'bg-purple-600 hover:bg-purple-700 text-white'
  },
  Enterprise: {
    bg: 'bg-gradient-to-br from-white to-indigo-50',
    border: 'border-indigo-200',
    text: 'text-indigo-600',
    icon: 'text-indigo-500 bg-indigo-100',
    button: 'bg-indigo-700 hover:bg-indigo-800 text-white'
  }
};

const plans = Object.keys(FEATURES) as Array<keyof typeof FEATURES>;

export function Subscription() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [status, setStatus] = useState<SubscriptionStatus | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [subscribing, setSubscribing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      navigate('/login');
      return;
    }
    // Carica stato abbonamento dal backend
    (async () => {
      setLoading(true);
      try {
        const subscriptionStatus = await getSubscriptionStatus(user.id);
        setStatus(subscriptionStatus);
      } catch (error) {
        setStatus(null);
      }
      setLoading(false);
    })();
  }, [user, navigate]);

  const handleSubscribe = async (planKey: string) => {
    if (!user) {
      navigate('/login');
      return;
    }

    if (planKey === 'Enterprise') {
      window.location.href = 'mailto:info@level-up.agency?subject=Enterprise Plan Inquiry';
      return;
    }

    try {
      setSubscribing(true);
      setError(null);
      setSuccess(null);

      // Utilizziamo prima la nuova API per il cambio piano via RPC
      const tierName = planKey.toLowerCase() as 'free' | 'basic' | 'advanced';
      const result = await requestPlanChange(user.id, tierName);
      
      if (result.success) {
        // Se cambio piano via RPC è riuscito, mostriamo messaggio di successo
        setSuccess(`Piano ${planKey} attivato con successo! Gli aggiornamenti saranno visibili al prossimo login.`);
        setTimeout(() => {
          // Ricarica lo stato dell'abbonamento
          getSubscriptionStatus(user.id)
            .then(updatedStatus => setStatus(updatedStatus))
            .catch(console.error);
        }, 1500);
        return;
      }
      
      // Se il cambio piano via RPC fallisce, proviamo con il metodo Stripe diretto
      console.warn('Cambio piano via RPC fallito, utilizzo checkout Stripe:', result.error);
            
      // Use payment links for both Basic and Advanced plans
      if (planKey === 'Basic' && STRIPE_PRODUCTS.BASIC.paymentLink) {
        window.location.href = STRIPE_PRODUCTS.BASIC.paymentLink;
        return;
      }

      if (planKey === 'Advanced' && STRIPE_PRODUCTS.ADVANCED.paymentLink) {
        window.location.href = STRIPE_PRODUCTS.ADVANCED.paymentLink;
        return;
      }

      // Fallback to regular checkout if no payment link available
      const priceId = planKey === 'Basic' 
        ? STRIPE_PRODUCTS.BASIC.priceId 
        : STRIPE_PRODUCTS.ADVANCED.priceId;

      window.location.href = `https://checkout.stripe.com/c/pay/${priceId}`;
    } catch (err) {
      const error = err as Error;
      setError(error.message);
      console.error('Subscription error:', error);
    } finally {
      setSubscribing(false);
    }
  };

  const handleManageSubscription = () => {
    window.location.href = 'https://billing.stripe.com/p/login/bIY2bne7jdXw0VybII';
  };

  if (!user) return null;

  const getUsagePercentage = () => {
    if (!status) return 0;
    return Math.min(100, (status.minutesUsed / status.monthlyMinutes) * 100);
  };

  // Render
  return (
    <div className="max-w-5xl mx-auto py-12 px-4">
      {error && (
        <div className="mb-6 p-4 bg-red-50 rounded-lg text-red-700 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}
      
      {success && (
        <div className="mb-6 p-4 bg-green-50 rounded-lg text-green-700 flex items-start gap-3">
          <Check className="h-5 w-5 mt-0.5 flex-shrink-0" />
          <span>{success}</span>
        </div>
      )}

      {/* Current Plan Status */}
      {status && (
        <div className="bg-gradient-to-br from-white to-blue-50 rounded-xl shadow-lg border border-blue-100 p-8 mb-12 transform transition-all duration-500 hover:scale-[1.02]">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-full bg-blue-100 flex items-center justify-center">
                <Sparkles className="h-6 w-6 text-blue-600" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-gray-900">
                  Il Tuo Piano {status.plan}
                </h2>
                <p className="text-gray-600">
                  Gestisci il tuo abbonamento e monitora l'utilizzo
                </p>
              </div>
            </div>
            <button
              onClick={handleManageSubscription}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Settings className="h-5 w-5" />
              <span>Gestisci Abbonamento</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-100">
              <div className="flex items-center gap-3 mb-4">
                <Clock className="h-5 w-5 text-blue-600" />
                <div>
                  <p className="text-sm text-gray-500">Minuti Utilizzati</p>
                  <p className="text-xl font-semibold text-gray-900">
                    {status.minutesUsed} / {status.monthlyMinutes}
                  </p>
                </div>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div 
                  className="bg-blue-600 h-2 rounded-full transition-all duration-1000 ease-out"
                  style={{ width: `${getUsagePercentage()}%` }}
                />
              </div>
            </div>

            <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-100">
              <div className="flex items-center gap-3 mb-2">
                <Zap className="h-5 w-5 text-green-600" />
                <div>
                  <p className="text-sm text-gray-500">Minuti Rimanenti</p>
                  <p className="text-xl font-semibold text-gray-900">
                    {status.minutesRemaining}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-100">
              <div className="flex items-center gap-3 mb-2">
                <CreditCard className="h-5 w-5 text-purple-600" />
                <div>
                  <p className="text-sm text-gray-500">Costo Mensile</p>
                  <p className="text-xl font-semibold text-gray-900">
                    €{status.price}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold mb-4">Scegli il Tuo Piano</h1>
        <p className="text-xl text-gray-600 max-w-2xl mx-auto">
          Tutti i piani includono trascrizione automatica e report medici in PDF.
          Aggiorna in qualsiasi momento per accedere a più funzionalità.
        </p>
      </div>
      
      {loading && (
        <div className="text-center my-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
        </div>
      )}
      
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
        {plans.map(planKey => {
          const color = PLAN_COLORS[planKey];
          const Icon = PLAN_ICONS[planKey];
          const isCurrentPlan = status?.plan.toLowerCase() === planKey.toLowerCase();
          const price = PLAN_PRICES[planKey];
          
          if (!color) return null;
          
          return (
            <div
              key={planKey}
              className={`relative rounded-xl p-6 border shadow-lg transition-all duration-500 hover:scale-105 hover:shadow-xl
                ${color.bg} ${color.border} ${isCurrentPlan ? 'ring-2 ring-blue-500' : ''}`}
            >
              {isCurrentPlan && (
                <div className="absolute -top-3 right-4">
                  <span className="inline-flex items-center bg-gradient-to-r from-blue-600 to-blue-500 text-white text-xs font-medium px-2.5 py-0.5 rounded-full shadow-lg whitespace-nowrap">
                    Piano Attuale
                  </span>
                </div>
              )}

              <div className="flex items-center gap-3 mb-6">
                <div className={`rounded-full p-3 ${color.icon}`}>
                  <Icon className="h-6 w-6" />
                </div>
                <span className={`text-xl font-bold ${color.text}`}>{planKey}</span>
              </div>

              <div className="mb-6">
                {price === null ? (
                  <div className="text-2xl font-bold text-gray-900">
                    Su Richiesta
                  </div>
                ) : (
                  <div>
                    <div className="text-4xl font-bold text-gray-900">
                      €{price}
                      <span className="text-base font-normal text-gray-500">/mese</span>
                    </div>
                    {planKey === 'Basic' && (
                      <p className="text-sm text-green-600 font-medium mt-2">
                        7 giorni di prova gratuita
                      </p>
                    )}
                  </div>
                )}
              </div>

              <ul className="mb-8 space-y-3">
                {FEATURES[planKey].map((feature, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                    <Check className="h-4 w-4 text-green-500 mt-1 flex-shrink-0" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>

              <button 
                onClick={() => !isCurrentPlan && handleSubscribe(planKey)}
                disabled={isCurrentPlan || subscribing}
                className={`w-full rounded-lg px-4 py-3 font-bold transition-all duration-300 flex items-center justify-center gap-2
                  ${isCurrentPlan ? 'opacity-50 cursor-not-allowed' : 'transform hover:translate-y-[-2px]'} ${color.button}`}
              >
                {subscribing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Attivazione...
                  </>
                ) : isCurrentPlan ? (
                  'Piano Attuale'
                ) : planKey === 'Enterprise' ? (
                  <>
                    <Mail className="h-4 w-4" />
                    Contattaci
                  </>
                ) : (
                  <>
                    Attiva Piano
                    <ChevronRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default Subscription;