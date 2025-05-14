// Script per verificare la struttura del database e le policy RLS
import { createClient } from '@supabase/supabase-js';

// Configurazione Supabase con service_role key (per accedere alle tabelle di sistema)
const SUPABASE_URL = 'https://qolrybalgasyxxduefqh.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFvbHJ5YmFsZ2FzeXh4ZHVlZnFoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NDM4NzY5MSwiZXhwIjoyMDU5OTYzNjkxfQ.gySJaIB9ZWBw3eiJkd-2lZBnO3gLJJXnFE39AZlcYUk';

// Creazione client Supabase con privileges elevati
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function checkTableStructure() {
  try {
    console.log('Verifica struttura tabelle...');
    
    // 1. Verifica la tabella 'users'
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('*')
      .limit(1);
      
    if (usersError) {
      console.error('Errore nell\'accesso alla tabella users:', usersError.message);
    } else {
      console.log('✅ Tabella users accessibile');
      
      // Verifica schema tabella users
      const { data: usersSchema, error: usersSchemaError } = await supabase
        .rpc('get_table_columns', { table_name: 'users' });
        
      if (usersSchemaError) {
        console.error('Errore nel recupero schema users:', usersSchemaError.message);
      } else {
        console.log('Schema tabella users:');
        usersSchema.forEach(col => {
          console.log(`- ${col.column_name}: ${col.data_type} ${col.is_nullable === 'YES' ? 'NULL' : 'NOT NULL'} ${col.column_default ? 'DEFAULT ' + col.column_default : ''}`);
        });
      }
    }
    
    // 2. Verifica la tabella 'user_subscriptions'
    const { data: subscriptions, error: subsError } = await supabase
      .from('user_subscriptions')
      .select('*')
      .limit(1);
      
    if (subsError) {
      console.error('Errore nell\'accesso alla tabella user_subscriptions:', subsError.message);
    } else {
      console.log('✅ Tabella user_subscriptions accessibile');
      
      // Verifica schema tabella user_subscriptions
      const { data: subsSchema, error: subsSchemaError } = await supabase
        .rpc('get_table_columns', { table_name: 'user_subscriptions' });
        
      if (subsSchemaError) {
        console.error('Errore nel recupero schema user_subscriptions:', subsSchemaError.message);
      } else {
        console.log('Schema tabella user_subscriptions:');
        subsSchema.forEach(col => {
          console.log(`- ${col.column_name}: ${col.data_type} ${col.is_nullable === 'YES' ? 'NULL' : 'NOT NULL'} ${col.column_default ? 'DEFAULT ' + col.column_default : ''}`);
        });
      }
    }
    
    // 3. Verifica la funzione SQL per creare abbonamenti free
    const { data: rpcExists, error: rpcError } = await supabase
      .rpc('function_exists', { function_name: 'create_free_subscription_for_user' });
      
    if (rpcError) {
      console.error('Errore nella verifica della funzione RPC:', rpcError.message);
    } else {
      console.log(`Funzione create_free_subscription_for_user: ${rpcExists ? 'Esiste' : 'Non esiste'}`);
    }
    
    // 4. Verifica dello stato RLS
    console.log('\nVerifica delle policy RLS:');
    
    // Controlla se RLS è attivo sulla tabella users
    const { data: usersRLS, error: usersRLSError } = await supabase
      .rpc('get_table_rls_status', { table_name: 'users' });
      
    if (usersRLSError) {
      console.error('Errore nel controllo RLS per users:', usersRLSError.message);
    } else {
      console.log(`Row Level Security sulla tabella users: ${usersRLS ? 'Attivo' : 'Non attivo'}`);
    }
    
    // Controlla se RLS è attivo sulla tabella user_subscriptions
    const { data: subsRLS, error: subsRLSError } = await supabase
      .rpc('get_table_rls_status', { table_name: 'user_subscriptions' });
      
    if (subsRLSError) {
      console.error('Errore nel controllo RLS per user_subscriptions:', subsRLSError.message);
    } else {
      console.log(`Row Level Security sulla tabella user_subscriptions: ${subsRLS ? 'Attivo' : 'Non attivo'}`);
    }
    
    // 5. Verifica delle policy esistenti
    try {
      console.log('\nPolicy sulla tabella users:');
      const { data: usersPolicies, error: usersPoliciesError } = await supabase
        .rpc('get_table_policies', { table_name: 'users' });
        
      if (usersPoliciesError) {
        console.error('Errore nel recupero policy per users:', usersPoliciesError.message);
      } else {
        if (usersPolicies.length === 0) {
          console.log('Nessuna policy trovata per la tabella users!');
        } else {
          usersPolicies.forEach(p => {
            console.log(`- ${p.policyname} (${p.permissive}): ${p.cmd} | ${p.qual}`);
          });
        }
      }
      
      console.log('\nPolicy sulla tabella user_subscriptions:');
      const { data: subsPolicies, error: subsPoliciesError } = await supabase
        .rpc('get_table_policies', { table_name: 'user_subscriptions' });
        
      if (subsPoliciesError) {
        console.error('Errore nel recupero policy per user_subscriptions:', subsPoliciesError.message);
      } else {
        if (subsPolicies.length === 0) {
          console.log('Nessuna policy trovata per la tabella user_subscriptions!');
        } else {
          subsPolicies.forEach(p => {
            console.log(`- ${p.policyname} (${p.permissive}): ${p.cmd} | ${p.qual}`);
          });
        }
      }
    } catch (policyError) {
      console.error('Errore durante il controllo delle policy:', policyError);
    }
  } catch (error) {
    console.error('Errore imprevisto:', error);
  }
}

// Esecuzione della verifica
checkTableStructure(); 