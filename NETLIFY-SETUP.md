# Configurazione di Netlify per Zenscribe.ai

## Impostazione delle Variabili d'Ambiente

Per garantire il funzionamento sicuro delle funzioni serverless, è necessario configurare le seguenti variabili d'ambiente nel dashboard di Netlify:

1. Vai su Netlify Dashboard > Il tuo sito > Site settings > Environment variables
2. Clicca su "Add variable" e aggiungi le seguenti variabili:

### Credenziali Supabase
```
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_SERVICE_KEY=your-service-key-here
```

> ⚠️ **Importante**: La `SUPABASE_SERVICE_KEY` è la chiave con privilegi amministrativi, **NON** la chiave anonima pubblica.
> Puoi trovarla in Supabase Dashboard > Project Settings > API > Project API keys > service_role secret

### URL del sito per il reset password
```
SITE_URL=https://zenscribe.it
```

### Chiavi Stripe (se necessarie)
```
STRIPE_SECRET_KEY=sk_test_your-stripe-key-here
```

## Funzioni Serverless

Le funzioni serverless sono definite nella cartella `netlify/functions/` e vengono distribuite automaticamente quando il sito viene deployato su Netlify.

Le principali funzioni sono:

- `auth.ts`: Gestisce autenticazione e verifica delle sottoscrizioni
- `subscription.ts`: Gestisce operazioni relative agli abbonamenti
- `transcribe-audio.ts`: Gestisce la trascrizione dell'audio
- `upload-direct.ts` e `upload-transcribe.ts`: Gestiscono upload e trascrizione

## Note sulla sicurezza

Le funzioni serverless sono utilizzate per:

1. Proteggere le credenziali sensibili come chiavi API private
2. Eseguire operazioni con privilegi elevati sul database
3. Centralizzare la logica di business in un ambiente sicuro
4. Evitare chiamate dirette al database dal frontend

Non memorizzare mai credenziali sensibili nel codice client o nei file di configurazione pubblica. 