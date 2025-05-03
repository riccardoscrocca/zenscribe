/**
 * Client per comunicare con le funzioni serverless di Netlify
 */

// URL base per le funzioni serverless
const BASE_URL = '/.netlify/functions';

/**
 * Gestisce l'autenticazione tramite la funzione serverless
 */
export const authClient = {
  /**
   * Esegui login con email e password in modo sicuro tramite la funzione serverless
   * @param email Email dell'utente
   * @param password Password dell'utente
   * @returns Risultato dell'operazione con sessione e dati utente
   */
  async signIn(email: string, password: string) {
    try {
      const response = await fetch(`${BASE_URL}/auth`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'signIn',
          email,
          password
        })
      });

      const data = await response.json();
      
      if (!response.ok) {
        return {
          data: null,
          error: data.error || 'Errore durante l\'accesso. Riprova più tardi.'
        };
      }

      return { data, error: null };
    } catch (error) {
      console.error('Auth client error:', error);
      return {
        data: null,
        error: error instanceof Error ? error.message : 'Errore imprevisto durante il login.'
      };
    }
  },

  /**
   * Invia email per reimpostare la password
   * @param email Email dell'utente
   */
  async resetPassword(email: string) {
    try {
      const response = await fetch(`${BASE_URL}/auth`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'resetPassword',
          email
        })
      });

      const data = await response.json();
      
      if (!response.ok) {
        return {
          data: null,
          error: data.error || 'Errore durante la richiesta di reset. Riprova più tardi.'
        };
      }

      return { data, error: null };
    } catch (error) {
      console.error('Reset password error:', error);
      return {
        data: null,
        error: error instanceof Error ? error.message : 'Errore imprevisto.'
      };
    }
  },

  /**
   * Verifica la validità della sottoscrizione di un utente
   * @param userId ID dell'utente
   */
  async validateSubscription(userId: string) {
    try {
      const response = await fetch(`${BASE_URL}/auth`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'validateSubscription',
          userId
        })
      });

      const data = await response.json();
      
      if (!response.ok) {
        return {
          success: false,
          error: data.error || 'Errore durante la validazione. Riprova più tardi.'
        };
      }

      return data; // { success: true, subscriptionId: ... }
    } catch (error) {
      console.error('Validate subscription error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Errore imprevisto.'
      };
    }
  }
};

/**
 * Gestisce gli abbonamenti tramite la funzione serverless
 */
export const subscriptionClient = {
  /**
   * Ottiene lo stato dell'abbonamento per un utente
   * @param userId ID dell'utente
   * @param authToken Token di autenticazione
   */
  async getSubscriptionStatus(userId: string, authToken: string) {
    try {
      const response = await fetch(`${BASE_URL}/subscription`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({
          action: 'getSubscriptionStatus',
          userId
        })
      });

      const data = await response.json();
      
      if (!response.ok) {
        console.error('Get subscription error:', data.error);
        // Restituisci dati di fallback/default per evitare il crash dell'UI
        return {
          id: null,
          plan: 'free',
          monthlyMinutes: 30,
          minutesUsed: 0,
          minutesRemaining: 30,
          startDate: new Date().toISOString(),
          endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          isActive: true,
          price: 0,
          error: data.error
        };
      }

      return data;
    } catch (error) {
      console.error('Get subscription error:', error);
      // Restituisci dati di fallback/default per evitare il crash dell'UI
      return {
        id: null,
        plan: 'free',
        monthlyMinutes: 30,
        minutesUsed: 0,
        minutesRemaining: 30,
        startDate: new Date().toISOString(),
        endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        isActive: true,
        price: 0,
        error: error instanceof Error ? error.message : 'Errore imprevisto.'
      };
    }
  },

  /**
   * Richiede il cambio piano per un utente
   * @param userId ID dell'utente
   * @param tier Nuovo tier ('free', 'basic', 'advanced')
   * @param authToken Token di autenticazione
   */
  async changePlan(userId: string, tier: 'free' | 'basic' | 'advanced', authToken: string) {
    try {
      const response = await fetch(`${BASE_URL}/subscription`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({
          action: 'changePlan',
          userId,
          tier
        })
      });

      const data = await response.json();
      
      if (!response.ok) {
        return {
          success: false,
          error: data.error || 'Errore durante il cambio piano. Riprova più tardi.'
        };
      }

      return data; // { success: true, subscriptionId: ..., message: ... }
    } catch (error) {
      console.error('Change plan error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Errore imprevisto durante il cambio piano.'
      };
    }
  },

  /**
   * Solo per amministratori - crea una sottoscrizione per un utente
   * @param email Email dell'utente
   * @param tier Tier dell'abbonamento
   * @param minutesUsed Minuti già utilizzati
   * @param authToken Token di autenticazione
   */
  async adminCreateSubscription(
    email: string, 
    tier: string = 'basic', 
    minutesUsed: number = 0,
    authToken: string
  ) {
    try {
      const response = await fetch(`${BASE_URL}/subscription`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({
          action: 'adminCreateSubscription',
          email,
          tier,
          minutesUsed
        })
      });

      const data = await response.json();
      
      if (!response.ok) {
        return {
          success: false,
          error: data.error || 'Errore durante la creazione dell\'abbonamento. Riprova più tardi.'
        };
      }

      return data; // { success: true, result: ..., message: ... }
    } catch (error) {
      console.error('Admin create subscription error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Errore imprevisto durante la creazione dell\'abbonamento.'
      };
    }
  }
}; 