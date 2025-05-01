import { supabase } from './supabase';
import { STRIPE_PRODUCTS } from './stripe-config';

export async function createCheckoutSession(priceId: string) {
  try {
    // Ottieni la sessione corrente dell'utente loggato
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      return { sessionId: null, error: 'not_authenticated' };
    }

    // URL della funzione serverless su Netlify (legge da .env su Netlify)
    const baseUrl = import.meta.env.PUBLIC_SUPABASE_URL || import.meta.env.SUPABASE_URL;

    const response = await fetch(`${baseUrl}/functions/v1/stripe-checkout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        price_id: priceId,
        success_url: `${window.location.origin}/app/subscription?success=true`,
        cancel_url: `${window.location.origin}/app/subscription?canceled=true`,
        mode: 'subscription',
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to create checkout session: ${errorText}`);
    }

    const data = await response.json();

    if (data.url) {
      window.location.href = data.url;
      return { sessionId: data.sessionId || null, error: null };
    }

    return { sessionId: data.sessionId || null, error: null };
  } catch (error) {
    console.error('Error creating checkout session:', error);
    return { sessionId: null, error: 'checkout_failed' };
  }
}
