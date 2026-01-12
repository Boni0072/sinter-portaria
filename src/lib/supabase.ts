import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export interface Driver {
  id: string;
  name: string;
  document: string;
  phone?: string;
  signature_url?: string;
  created_by?: string;
  created_at: string;
}

export interface Vehicle {
  id: string;
  plate: string;
  brand?: string;
  model?: string;
  color?: string;
  driver_id?: string;
  created_at: string;
}

export interface Entry {
  id: string;
  vehicle_id?: string;
  driver_id?: string;
  entry_time: string;
  exit_time?: string;
  vehicle_photo_url?: string;
  plate_photo_url?: string;
  notes?: string;
  registered_by?: string;
  exit_registered_by?: string;
  created_at: string;
}
