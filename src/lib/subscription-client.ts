import { supabase } from './supabase';

/**
 * Richiede il cambio piano per un utente
 * @param userId ID dell'utente
 * @param newTier Nuovo tier ('free', 'basic', 'advanced')
 * @returns Risultato dell'operazione
 */
export async function requestPlanChange(userId: string, newTier: 'free' | 'basic' | 'advanced') {
  try {
    // Chiamata alla funzione RPC handle_plan_change
    const { data, error } = await supabase.rpc('handle_plan_change', {
      p_user_id: userId,
      p_new_tier: newTier
    });

    if (error) {
      console.error('Errore nel cambio piano:', error);
      return { success: false, error: error.message };
    }

    return { success: true, subscriptionId: data };
  } catch (err) {
    console.error('Errore imprevisto nel cambio piano:', err);
    return { success: false, error: err instanceof Error ? err.message : 'Errore sconosciuto' };
  }
}

/**
 * Verifica se la sottoscrizione di un utente è valida
 * @param userId ID dell'utente
 * @returns ID della sottoscrizione validata
 */
export async function ensureValidSubscription(userId: string) {
  try {
    // Aggiungiamo un timeout per evitare blocchi
    const timeoutPromise = new Promise<{success: false, error: string}>((resolve) => {
      setTimeout(() => {
        resolve({ success: false, error: 'Timeout durante la verifica della sottoscrizione' });
      }, 5000); // 5 secondi di timeout
    });

    // Chiamata alla funzione RPC con timeout
    const callPromise = new Promise<{success: boolean, error?: string, subscriptionId?: string}>(async (resolve) => {
      try {
        const { data, error } = await supabase.rpc('ensure_valid_subscription', {
          user_id: userId
        });

        if (error) {
          console.error('Errore nella verifica sottoscrizione:', error);
          resolve({ success: false, error: error.message });
          return;
        }
        
        resolve({ success: true, subscriptionId: data });
      } catch (err) {
        console.error('Errore imprevisto nella verifica sottoscrizione:', err);
        resolve({ 
          success: false, 
          error: err instanceof Error ? err.message : 'Errore sconosciuto' 
        });
      }
    });

    // Utilizziamo Promise.race per ottenere il primo risultato (o il timeout)
    return await Promise.race([callPromise, timeoutPromise]);
  } catch (err) {
    console.error('Errore imprevisto nella verifica sottoscrizione:', err);
    return { success: false, error: err instanceof Error ? err.message : 'Errore sconosciuto' };
  }
}

/**
 * Solo per amministratori - crea una sottoscrizione per un utente
 * @param email Email dell'utente
 * @param tier Tier da assegnare
 * @param minutesUsed Minuti già utilizzati
 * @returns Risultato dell'operazione
 */
export async function adminCreateSubscription(email: string, tier: string = 'basic', minutesUsed: number = 0) {
  try {
    const { data, error } = await supabase.rpc('admin_create_subscription', {
      p_email: email,
      p_tier: tier,
      p_minutes_used: minutesUsed
    });

    if (error) {
      console.error('Errore nella creazione sottoscrizione:', error);
      return { success: false, error: error.message };
    }

    return { success: true, result: data };
  } catch (err) {
    console.error('Errore imprevisto nella creazione sottoscrizione:', err);
    return { success: false, error: err instanceof Error ? err.message : 'Errore sconosciuto' };
  }
} 