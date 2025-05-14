-- Attiva Row Level Security sulla tabella users
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Policy per consentire agli utenti autenticati di inserire il proprio profilo
CREATE POLICY "Authenticated can insert own profile"
ON public.users
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = id);

-- Policy per consentire agli utenti autenticati di leggere il proprio profilo
CREATE POLICY "Authenticated can read own profile"
ON public.users
FOR SELECT
TO authenticated
USING (auth.uid() = id);

-- Policy per consentire agli utenti autenticati di aggiornare il proprio profilo
CREATE POLICY "Authenticated can update own profile"
ON public.users
FOR UPDATE
TO authenticated
USING (auth.uid() = id);

-- Attiva Row Level Security sulla tabella user_subscriptions (facoltativo, per completezza)
ALTER TABLE public.user_subscriptions ENABLE ROW LEVEL SECURITY;

-- Policy per consentire agli utenti autenticati di leggere i propri abbonamenti
CREATE POLICY "Authenticated can read own subscriptions"
ON public.user_subscriptions
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Policy per consentire agli utenti autenticati di inserire i propri abbonamenti
CREATE POLICY "Authenticated can insert own subscriptions"
ON public.user_subscriptions
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Policy per consentire agli utenti autenticati di aggiornare i propri abbonamenti
CREATE POLICY "Authenticated can update own subscriptions"
ON public.user_subscriptions
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id); 