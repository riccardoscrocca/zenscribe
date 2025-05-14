import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { getSubscriptionStatus } from '../lib/subscriptions';
import { CreditCard, Clock, Shield } from 'lucide-react';

export function SubscriptionSummary() {
  const { user } = useAuth();
  const [subscriptionStatus, setSubscriptionStatus] = useState({
    minutesUsed: 0,
    monthlyMinutes: 0,
    minutesRemaining: 0,
    plan: 'free',
    price: 0
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  // Funzione per aggiornare lo stato dell'abbonamento
  const updateSubscriptionStatus = async () => {
    try {
      if (!user) return;
      const status = await getSubscriptionStatus(user.id);
      setSubscriptionStatus(status);
      setError('');
    } catch (err) {
      console.error('Errore nel caricamento dello stato abbonamento:', err);
      setError('Errore nel caricamento dei dati dell\'abbonamento');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Carica lo stato iniziale
    updateSubscriptionStatus();

    // Sottoscrivi agli aggiornamenti in tempo reale
    const subscription = supabase
      .channel('subscription_updates')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'user_subscriptions',
          filter: `user_id=eq.${user?.id}`
        },
        () => {
          // Aggiorna lo stato quando ricevi una notifica
          updateSubscriptionStatus();
        }
      )
      .subscribe();

    // Cleanup della sottoscrizione
    return () => {
      subscription.unsubscribe();
    };
  }, [user]);

  const planDisplayName = {
    'free': 'Piano Free',
    'basic': 'Piano Basic',
    'advanced': 'Piano Advanced',
    'enterprise': 'Piano Enterprise'
  }[subscriptionStatus.plan] || 'Piano Free';

  const getUsagePercentage = () => {
    if (subscriptionStatus.monthlyMinutes === 0) return 0;
    return Math.min(100, (subscriptionStatus.minutesUsed / subscriptionStatus.monthlyMinutes) * 100);
  };

  const getProgressBarColor = () => {
    const percentage = getUsagePercentage();
    if (percentage >= 90) return 'bg-gradient-to-r from-red-500 to-red-600';
    if (percentage >= 75) return 'bg-gradient-to-r from-yellow-500 to-red-500';
    if (percentage >= 50) return 'bg-gradient-to-r from-green-500 to-yellow-500';
    return 'bg-gradient-to-r from-green-400 to-green-500';
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow border border-gray-100 p-5">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-1/4 mb-4"></div>
          <div className="h-12 bg-gray-200 rounded mb-4"></div>
          <div className="h-2 bg-gray-200 rounded-full"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow border border-gray-100 p-5">
      <div className="flex justify-between items-center mb-4">
        <h3 className="font-medium text-gray-900">Abbonamento</h3>
        <a 
          href="/app/subscription"
          className="text-sm text-blue-600 hover:text-blue-800"
        >
          Gestisci
        </a>
      </div>
      <div className="flex items-center gap-3 mb-4">
        <div className="h-12 w-12 rounded-full bg-blue-100 flex items-center justify-center">
          <CreditCard className="h-6 w-6 text-blue-600" />
        </div>
        <div>
          <p className="text-sm text-gray-500">Piano attuale</p>
          <p className="text-lg font-semibold">{planDisplayName}</p>
        </div>
      </div>
      
      <div className="mb-3">
        <div className="flex justify-between items-center mb-1">
          <div className="flex items-center gap-1">
            <Clock className="h-4 w-4 text-gray-500" />
            <span className="text-sm text-gray-500">Minuti disponibili</span>
          </div>
          <span className="text-sm font-medium">
            {subscriptionStatus.minutesRemaining} / {subscriptionStatus.monthlyMinutes}
          </span>
        </div>
        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
          <div 
            className={`h-full ${getProgressBarColor()} transition-all duration-300`}
            style={{ width: `${getUsagePercentage()}%` }}
          ></div>
        </div>
      </div>
      
      {error && (
        <p className="text-xs text-red-600 mt-2">
          {error}
        </p>
      )}
      
      <div className="flex items-center gap-1 text-sm text-gray-500">
        <Shield className="h-4 w-4" />
        <span>
          {subscriptionStatus.plan === 'free'
            ? 'Piano gratuito con limitazioni'
            : `${subscriptionStatus.price}€/mese`}
        </span>
      </div>
    </div>
  );
} 