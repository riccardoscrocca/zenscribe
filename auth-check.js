// Script per verificare il problema di autenticazione e uid
import { createClient } from '@supabase/supabase-js';

// Configurazione Supabase con anon key
const SUPABASE_URL = 'https://qolrybalgasyxxduefqh.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFvbHJ5YmFsZ2FzeXh4ZHVlZnFoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDQzODc2OTEsImV4cCI6MjA1OTk2MzY5MX0.u_0PbJW-srFBjLil6yt2Qvvl8T1dv7VETqrFR-LF3TA';

// Creazione client Supabase
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Email di test
const testEmail = 'rscrocca1982@gmail.com';
const testPassword = 'Pocket2020';

async function checkAuthUid() {
  try {
    console.log('Test di login per verificare auth.uid()...');
    
    // Login con le credenziali fornite
    const { data, error } = await supabase.auth.signInWithPassword({
      email: testEmail,
      password: testPassword
    });
    
    if (error) {
      console.error('Errore durante il login:', error.message);
      return;
    }
    
    console.log('Login eseguito con successo');
    console.log('User ID da sessione:', data.user.id);
    
    // Verifica auth.uid() con una query RPC
    const { data: authData, error: authError } = await supabase.rpc('get_auth_uid');
    
    if (authError) {
      console.error('Errore nel recupero di auth.uid():', authError.message);
      console.log('Creazione funzione RPC necessaria in Supabase SQL...');
      console.log(`
CREATE OR REPLACE FUNCTION get_auth_uid()
RETURNS uuid
LANGUAGE sql SECURITY DEFINER
AS $$
  SELECT auth.uid();
$$;      
      `);
    } else {
      console.log('auth.uid() dalla funzione:', authData);
      console.log('Match tra auth.uid() e session.user.id:', data.user.id === authData);
    }
    
    // Verifica se può inserire un record
    const randomValue = Math.floor(Math.random() * 1000000);
    const { data: insertData, error: insertError } = await supabase
      .from('users')
      .insert({
        id: data.user.id,
        email: data.user.email,
        test_value: `Test ${randomValue}`
      })
      .select();
      
    if (insertError) {
      console.error('Errore nell\'inserimento record:', insertError.message);
      if (insertError.message.includes('duplicate key')) {
        console.log('L\'utente esiste già nella tabella users, prova ad aggiornarlo invece...');
        
        // Prova ad aggiornare invece
        const { data: updateData, error: updateError } = await supabase
          .from('users')
          .update({
            test_value: `Test update ${randomValue}`
          })
          .eq('id', data.user.id)
          .select();
          
        if (updateError) {
          console.error('Errore nell\'aggiornamento record:', updateError.message);
        } else {
          console.log('Record aggiornato con successo:', updateData);
        }
      }
    } else {
      console.log('Record inserito con successo:', insertData);
    }
    
    // Verifica che il record sia recuperabile
    const { data: selectData, error: selectError } = await supabase
      .from('users')
      .select('*')
      .eq('id', data.user.id)
      .single();
      
    if (selectError) {
      console.error('Errore nel recupero record:', selectError.message);
    } else {
      console.log('Record recuperato con successo:', selectData);
    }
  } catch (error) {
    console.error('Errore imprevisto durante il test:', error);
  }
}

// Esecuzione del test
checkAuthUid(); 