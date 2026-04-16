import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_ANON_KEY!;

// This uses Supabase REST API over HTTPS (port 443) — always reachable
export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false }
});

export default supabase;
