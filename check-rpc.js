// Script per verificare l'esistenza delle funzioni RPC
import { createClient } from '@supabase/supabase-js';

// Configurazione Supabase
const SUPABASE_URL = 'https://qolrybalgasyxxduefqh.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFvbHJ5YmFsZ2FzeXh4ZHVlZnFoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDQzODc2OTEsImV4cCI6MjA1OTk2MzY5MX0.u_0PbJW-srFBjLil6yt2Qvvl8T1dv7VETqrFR-LF3TA';

// Creazione client Supabase
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Funzione per verificare l'esistenza delle funzioni RPC
async function checkRpcFunctions() {
  console.log('Verifica esistenza delle funzioni RPC...');
  const functions = ['admin_insert_user', 'get_auth_uid', 'function_exists'];
  
  for (const func of functions) {
    try {
      // Tentiamo di chiamare la funzione (senza parametri, ci aspettiamo un errore ma non "function not found")
      const { data, error } = await supabase.rpc(func);
      
      if (error && error.message.includes('function') && error.message.includes('does not exist')) {
        console.log(`❌ Funzione ${func}: NON esiste`);
      } else {
        console.log(`✅ Funzione ${func}: ESISTE (errore potrebbe essere per parametri mancanti)`);
      }
      
      if (error) console.log(`   Errore: ${error.message}`);
    } catch (e) {
      console.log(`❌ Funzione ${func}: NON esiste (errore: ${e.message})`);
    }
  }
  
  // Verificare se abbiamo la funzione RPC per creare abbonamenti free
  try {
    console.log('\nVerifica funzione create_free_subscription_for_user:');
    const { data, error } = await supabase.rpc('create_free_subscription_for_user', { 
      user_id: '00000000-0000-0000-0000-000000000000' 
    });
    
    if (error && error.message.includes('function') && error.message.includes('does not exist')) {
      console.log('❌ Funzione create_free_subscription_for_user: NON esiste');
    } else {
      console.log('✅ Funzione create_free_subscription_for_user: ESISTE');
    }
    
    if (error) console.log(`   Errore: ${error.message}`);
  } catch (e) {
    console.log(`❌ Funzione create_free_subscription_for_user: NON esiste (errore: ${e.message})`);
  }
}

// Esecuzione della verifica
checkRpcFunctions(); 