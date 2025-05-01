import { type Plan } from '../types';

export const STRIPE_PRODUCTS = {
  BASIC: {
    priceId: 'price_1RGUb2B9FcmmWrIESocQ8V0O',
    name: 'ZenScribe.ai Basic',
    description: 'Abbonamento mensile a ZenScribe.ai - Tier Basic',
    price: 99,
    mode: 'subscription' as const,
    trial_days: 7,
    paymentLink: 'https://buy.stripe.com/9AQ5kEaYi5uUfHqdQR'
  },
  ADVANCED: {
    priceId: 'price_1RGUcNB9FcmmWrIEBTjmkETi',
    name: 'ZenScribe.ai Advanced',
    description: 'Abbonamento mensile a ZenScribe.ai - Tier Advanced',
    price: 199,
    mode: 'subscription' as const,
    paymentLink: 'https://buy.stripe.com/7sI9AUfey2iI7aU8ww'
  }
} as const;