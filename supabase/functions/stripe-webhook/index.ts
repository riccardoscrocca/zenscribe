import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import Stripe from 'npm:stripe@17.7.0';
import { createClient } from 'npm:@supabase/supabase-js@2.49.1';

const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
const stripeSecret = Deno.env.get('STRIPE_SECRET_KEY')!;
const stripeWebhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')!;
const stripe = new Stripe(stripeSecret, {
  apiVersion: '2023-10-16',
});

Deno.serve(async (req) => {
  try {
    // Handle OPTIONS request for CORS preflight
    if (req.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        },
      });
    }

    if (req.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    // Get the signature from the header
    const signature = req.headers.get('stripe-signature');
    if (!signature) {
      return new Response('No signature found', { status: 400 });
    }

    // Get the raw body
    const body = await req.text();

    // Verify the webhook signature
    let event: Stripe.Event;
    try {
      event = await stripe.webhooks.constructEventAsync(body, signature, stripeWebhookSecret);
    } catch (err) {
      console.error('Webhook signature verification failed:', err);
      return new Response('Invalid signature', { status: 400 });
    }

    // Handle the event
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        
        // Get customer details
        const customer = await stripe.customers.retrieve(session.customer as string);
        
        // Get subscription details if this was a subscription checkout
        if (session.mode === 'subscription' && session.subscription) {
          const subscription = await stripe.subscriptions.retrieve(session.subscription as string);
          
          // Update user's subscription tier based on the price
          const priceId = subscription.items.data[0].price.id;
          const tier = priceId === 'price_1RGUb2B9FcmmWrIESocQ8V0O' ? 'basic' : 'advanced';
          
          // Update the user's subscription tier
          const { error: updateError } = await supabase
            .from('users')
            .update({ 
              subscription_tier: tier,
              updated_at: new Date().toISOString()
            })
            .eq('email', customer.email);

          if (updateError) {
            console.error('Error updating user subscription:', updateError);
            throw updateError;
          }

          // Store subscription details
          const { error: subError } = await supabase
            .from('stripe_subscriptions')
            .upsert({
              customer_id: customer.id,
              subscription_id: subscription.id,
              price_id: priceId,
              current_period_start: subscription.current_period_start,
              current_period_end: subscription.current_period_end,
              status: subscription.status,
              cancel_at_period_end: subscription.cancel_at_period_end,
              payment_method_brand: null, // Will be updated when payment method is attached
              payment_method_last4: null
            });

          if (subError) {
            console.error('Error storing subscription:', subError);
            throw subError;
          }
        }
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        const priceId = subscription.items.data[0].price.id;
        const tier = priceId === 'price_1RGUb2B9FcmmWrIESocQ8V0O' ? 'basic' : 'advanced';

        // Get customer email
        const customer = await stripe.customers.retrieve(subscription.customer as string);

        // Update user's subscription tier
        const { error: updateError } = await supabase
          .from('users')
          .update({ 
            subscription_tier: tier,
            updated_at: new Date().toISOString()
          })
          .eq('email', customer.email);

        if (updateError) {
          console.error('Error updating user subscription:', updateError);
          throw updateError;
        }

        // Update subscription details
        const { error: subError } = await supabase
          .from('stripe_subscriptions')
          .upsert({
            customer_id: subscription.customer as string,
            subscription_id: subscription.id,
            price_id: priceId,
            current_period_start: subscription.current_period_start,
            current_period_end: subscription.current_period_end,
            status: subscription.status,
            cancel_at_period_end: subscription.cancel_at_period_end
          });

        if (subError) {
          console.error('Error updating subscription:', subError);
          throw subError;
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        
        // Get customer email
        const customer = await stripe.customers.retrieve(subscription.customer as string);

        // Update user's subscription tier to free
        const { error: updateError } = await supabase
          .from('users')
          .update({ 
            subscription_tier: 'free',
            updated_at: new Date().toISOString()
          })
          .eq('email', customer.email);

        if (updateError) {
          console.error('Error updating user subscription:', updateError);
          throw updateError;
        }

        // Mark subscription as deleted
        const { error: subError } = await supabase
          .from('stripe_subscriptions')
          .update({
            status: 'canceled',
            deleted_at: new Date().toISOString()
          })
          .eq('subscription_id', subscription.id);

        if (subError) {
          console.error('Error marking subscription as deleted:', subError);
          throw subError;
        }
        break;
      }

      // Add other event types as needed
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error processing webhook:', error);
    return new Response(JSON.stringify({ error: error.message }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
});