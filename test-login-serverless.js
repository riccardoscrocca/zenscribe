// Script per testare il login usando serverless-client
import fetch from 'node-fetch';

// Simulazione dell'ambiente browser per fetch
globalThis.fetch = fetch;

// Credenziali di test
const testEmail = 'rscrocca1982@gmail.com';
const testPassword = 'Pocket2020';

// URL dell'API serverless
const API_URL = 'https://zenscribe.netlify.app/.netlify/functions';

// Funzione per il login serverless
async function loginServerless(email, password) {
  try {
    console.log('Tentativo di login serverless per:', email);
    
    const response = await fetch(`${API_URL}/auth`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'login',
        email,
        password,
      }),
    });
    
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Errore durante il login serverless:', error);
    return { success: false, error: error.message };
  }
}

// Funzione di test
async function testLogin() {
  console.log('Tentativo di login con le credenziali fornite...');
  
  try {
    const result = await loginServerless(testEmail, testPassword);
    
    if (!result.success) {
      console.error('Errore di autenticazione:', result.error || 'Errore sconosciuto');
      return;
    }
    
    console.log('Login eseguito con successo!');
    console.log('Dettagli sessione:', result.session ? 'Sessione valida' : 'Nessuna sessione');
    console.log('Dettagli utente:', result.user ? `ID: ${result.user.id}` : 'Nessun utente');
    
  } catch (err) {
    console.error('Errore imprevisto durante il test:', err);
  }
}

// Esecuzione del test
testLogin(); 