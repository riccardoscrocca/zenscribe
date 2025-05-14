# Fix per il problema "Database error granting user"

Questo documento descrive il problema "Database error granting user" che si verificava durante il login degli utenti su Zenscribe.ai e la soluzione implementata.

## Il problema

Il problema si manifestava durante il login con le seguenti caratteristiche:
- L'autenticazione con Supabase Auth funzionava correttamente
- La creazione del profilo utente nella tabella `public.users` falliva con l'errore "Database error granting user"
- Gli utenti non riuscivano a completare il login

La causa principale era legata alle policy Row Level Security (RLS) di Supabase che impedivano la creazione automatica del profilo utente dopo l'autenticazione.

## La soluzione

La soluzione implementa un approccio a più livelli:

### 1. Trigger SQL lato database

Abbiamo creato due trigger database per bypassare completamente RLS:

- **Trigger su auth.users**: crea automaticamente un profilo nella tabella `public.users` quando un nuovo utente si registra
- **Trigger su auth.sessions**: verifica e crea il profilo durante il login per utenti esistenti che non hanno ancora un profilo

I trigger utilizzano `SECURITY DEFINER` per essere eseguiti con i privilegi dell'owner del database, bypassando RLS.

### 2. Client più robusto

Abbiamo migliorato il client Supabase con:
- Sistema di retry con backoff esponenziale
- Recupero automatico da sessioni parziali
- Fallback con serverless function
- Magic link come ultima risorsa

### 3. Serverless function

Abbiamo implementato una function Netlify (`user-profile.ts`) che può creare profili utente con chiavi di servizio, bypassando completamente RLS.

## Come applicare la soluzione

Per applicare questa soluzione:

1. Eseguire la migrazione SQL `20240525_fix_auth_triggers.sql` sul database Supabase
2. Assicurarsi che la funzione serverless `user-profile.ts` sia deployata
3. Verificare che il client Supabase sia aggiornato con il codice di gestione errori migliorato

## Test

Per verificare che la soluzione funzioni:
1. Creare un nuovo utente e verificare che il profilo venga creato automaticamente
2. Effettuare logout e login con un utente esistente
3. Verificare nei logs Supabase che non ci siano più errori "Database error granting user" 