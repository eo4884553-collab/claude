'use client';
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// undefined em build/preview sem as env vars configuradas ainda — as telas tratam isso
// mostrando uma mensagem de configuração pendente em vez de quebrar
export const supabase = (url && anonKey) ? createClient(url, anonKey) : null;

export const supabaseConfigured = !!supabase;
