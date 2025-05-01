import { supabase } from './supabase';

// Helper function to get current period dates
function getCurrentPeriod() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  return { start, end };
}

export async function getSubscriptionStatus(userId: string) {
  try {
    // Get user's subscription tier
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('subscription_tier')
      .eq('id', userId)
      .single();

    if (userError) {
      console.error('Error fetching user:', userError);
      return {
        minutesUsed: 0,
        monthlyMinutes: 30,
        minutesRemaining: 30,
        plan: 'free',
        price: 0
      };
    }

    // Get plan details based on user's tier
    const { data: planData, error: planError } = await supabase
      .from('subscription_plans')
      .select('*')
      .eq('name', userData.subscription_tier)
      .single();

    if (planError) {
      console.error('Error fetching plan:', planError);
      return {
        minutesUsed: 0,
        monthlyMinutes: 30,
        minutesRemaining: 30,
        plan: 'free',
        price: 0
      };
    }

    // Get current subscription with correct period check
    const nowIso = new Date().toISOString();
    const { data: subscriptions, error: subError } = await supabase
      .from('user_subscriptions')
      .select('minutes_used')
      .eq('user_id', userId)
      .lte('current_period_start', nowIso)
      .gte('current_period_end', nowIso)
      .maybeSingle();

    if (subError) {
      console.error('Error fetching subscription:', subError);
      console.log('Subscription query params:', { userId, nowIso });
    }

    const minutesUsed = subscriptions?.minutes_used || 0;
    console.log('Subscription data:', { subscriptions, minutesUsed });
    
    return {
      minutesUsed,
      monthlyMinutes: planData.monthly_minutes,
      minutesRemaining: Math.max(0, planData.monthly_minutes - minutesUsed),
      plan: userData.subscription_tier,
      price: planData.price_monthly
    };

  } catch (error) {
    console.error('Error getting subscription status:', error);
    return {
      minutesUsed: 0,
      monthlyMinutes: 30,
      minutesRemaining: 30,
      plan: 'free',
      price: 0
    };
  }
}

export async function updateMinutesUsed(userId: string, durationSeconds: number) {
  try {
    const minutes = Math.ceil(durationSeconds / 60);
    const period = getCurrentPeriod();

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

    console.log('Current subscription:', subscription);

    // If no subscription exists, create one
    if (!subscription) {
      // Check if minutes would exceed limit
      if (minutes > planData.monthly_minutes) {
        return false;
      }

      // Create new subscription
      const { error: createError } = await supabase
        .from('user_subscriptions')
        .insert({
          user_id: userId,
          plan_id: planData.id,
          minutes_used: minutes,
          current_period_start: period.start.toISOString(),
          current_period_end: period.end.toISOString()
        });

      if (createError) {
        console.error('Error creating subscription:', createError);
        return false;
      }

      return true;
    }

    // Check if update would exceed limit
    if ((subscription.minutes_used + minutes) > planData.monthly_minutes) {
      return false;
    }

    // Update minutes used
    const { error: updateError } = await supabase
      .from('user_subscriptions')
      .update({ 
        minutes_used: (subscription.minutes_used || 0) + minutes 
      })
      .eq('id', subscription.id);

    if (updateError) {
      console.error('Error updating minutes used:', updateError);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error updating minutes used:', error);
    return false;
  }
}

export async function checkMinutesAvailable(userId: string, durationSeconds: number) {
  try {
    const status = await getSubscriptionStatus(userId);
    const minutesNeeded = Math.ceil(durationSeconds / 60);
    return status.minutesRemaining >= minutesNeeded;
  } catch (error) {
    console.error('Error checking minutes availability:', error);
    return false;
  }
}