import { supabase } from './supabase';
import { subscriptionClient } from './serverless-client';

// Helper function to get current period dates
function getCurrentPeriod() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  return { start, end };
}

/**
 * Ottiene lo stato dell'abbonamento per un utente
 * @param userId ID dell'utente
 * @returns Promise con lo stato dell'abbonamento
 */
export async function getSubscriptionStatus(userId: string) {
  try {
    // Ottieni la sessione corrente
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      throw new Error('Sessione non valida');
    }
    
    const authToken = session.access_token;
    
    // Prova prima l'approccio serverless
    try {
      const data = await subscriptionClient.getSubscriptionStatus(userId, authToken);
      if (!data.error) {
        return data;
      }
      console.warn('Fallback a metodo diretto per getSubscriptionStatus:', data.error);
      // Se fallisce, passa al metodo diretto
    } catch (serverlessError) {
      console.warn('Errore con serverless, fallback a metodo diretto:', serverlessError);
      // Continua con il metodo diretto
    }
    
    // Metodo diretto - fallback
    const { data: subscription, error } = await supabase
      .from('user_subscriptions')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      console.error('Error fetching subscription:', error);
      // Se non esiste sottoscrizione, restituisci un oggetto con dati predefiniti
      return {
        id: null,
        plan: 'free',
        monthlyMinutes: 30,
        minutesUsed: 0,
        minutesRemaining: 30,
        price: 0
      };
    }

    if (!subscription) {
      // Se l'utente non ha una sottoscrizione, crea una sottoscrizione free
      const { data: validSubscription, error: rpcError } = await supabase.rpc('ensure_valid_subscription', {
        user_id: userId
      });

      if (rpcError) {
        console.error('Error creating subscription:', rpcError);
        return {
          id: null,
          plan: 'free',
          monthlyMinutes: 30,
          minutesUsed: 0,
          minutesRemaining: 30,
          price: 0
        };
      }

      // Recupera la sottoscrizione appena creata
      const { data: newSubscription, error: newSubError } = await supabase
        .from('user_subscriptions')
        .select('*')
        .eq('id', validSubscription)
        .single();

      if (newSubError) {
        console.error('Error fetching new subscription:', newSubError);
        return {
          id: null,
          plan: 'free',
          monthlyMinutes: 30,
          minutesUsed: 0,
          minutesRemaining: 30,
          price: 0
        };
      }

      // Calcola i minuti rimanenti
      const monthlyMinutes = newSubscription.monthly_minutes || 0;
      const minutesUsed = newSubscription.minutes_used || 0;
      const minutesRemaining = Math.max(0, monthlyMinutes - minutesUsed);

      return {
        id: newSubscription.id,
        plan: newSubscription.tier,
        monthlyMinutes,
        minutesUsed,
        minutesRemaining,
        price: getPriceForTier(newSubscription.tier)
      };
    }

    // Calcola i minuti rimanenti
    const monthlyMinutes = subscription.monthly_minutes || 0;
    const minutesUsed = subscription.minutes_used || 0;
    const minutesRemaining = Math.max(0, monthlyMinutes - minutesUsed);

    return {
      id: subscription.id,
      plan: subscription.tier,
      monthlyMinutes,
      minutesUsed,
      minutesRemaining,
      price: getPriceForTier(subscription.tier)
    };
  } catch (error) {
    console.error('Subscription status error:', error);
    // In caso di errore, restituisci un oggetto con dati predefiniti
    return {
      id: null,
      plan: 'free',
      monthlyMinutes: 30,
      minutesUsed: 0,
      minutesRemaining: 30,
      price: 0
    };
  }
}

/**
 * Ottiene il prezzo per un determinato tier
 * @param tier Tier dell'abbonamento
 * @returns Prezzo del tier
 */
function getPriceForTier(tier: string): number {
  const PRICES = {
    free: 0,
    basic: 9.99,
    advanced: 19.99,
    enterprise: 49.99
  };
  
  return PRICES[tier.toLowerCase() as keyof typeof PRICES] || 0;
}

export async function updateMinutesUsed(userId: string, durationSeconds: number) {
  try {
    console.log('updateMinutesUsed called with:', { userId, durationSeconds });
    const minutes = Math.ceil(durationSeconds / 60);
    console.log('Calculated minutes:', { minutes, calculation: `Math.ceil(${durationSeconds} / 60) = ${minutes}` });
    
    // Get user's subscription tier and plan details
    const { data: userData } = await supabase
      .from('users')
      .select('subscription_tier')
      .eq('id', userId)
      .single();

    const { data: planData } = await supabase
      .from('subscription_plans')
      .select('id, monthly_minutes')
      .eq('name', userData?.subscription_tier || 'free')
      .single();

    if (!planData) {
      console.error('No plan found');
      return false;
    }

    // Get current subscription with correct period check
    const nowIso = new Date().toISOString();
    const { data: subscription, error: subError } = await supabase
      .from('user_subscriptions')
      .select('id, minutes_used')
      .eq('user_id', userId)
      .lte('current_period_start', nowIso)
      .gte('current_period_end', nowIso)
      .maybeSingle();

    console.log('Current subscription:', { subscription, minutesToAdd: minutes });

    // Check if minutes would exceed limit
    if (subscription && (subscription.minutes_used + minutes) > planData.monthly_minutes) {
      console.log('Minutes would exceed limit:', {
        current: subscription.minutes_used,
        toAdd: minutes,
        limit: planData.monthly_minutes
      });
      return false;
    } else if (!subscription && minutes > planData.monthly_minutes) {
      console.log('Initial minutes would exceed limit:', {
        toAdd: minutes,
        limit: planData.monthly_minutes
      });
      return false;
    }

    // Non aggiorniamo più manualmente i minuti qui, lasciamo che sia il trigger SQL a farlo
    // quando viene creata/aggiornata la consultazione
    console.log('Minutes check passed, trigger SQL gestirà l\'aggiornamento');
    return true;

  } catch (error) {
    console.error('Error checking minutes availability:', error);
    return false;
  }
}

export async function checkMinutesAvailable(userId: string, durationSeconds: number) {
  try {
    const status = await getSubscriptionStatus(userId);
    const minutesNeeded = Math.ceil(durationSeconds / 60);
    const isAvailable = status.minutesRemaining >= minutesNeeded;
    
    console.log('Minutes availability check:', {
      minutesNeeded,
      minutesRemaining: status.minutesRemaining,
      isAvailable
    });
    
    return isAvailable;
  } catch (error) {
    console.error('Error checking minutes availability:', error);
    return false;
  }
}