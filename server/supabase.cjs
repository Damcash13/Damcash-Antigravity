require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
const supabaseKey = supabaseServiceKey || process.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const supabaseUsesServiceRole = Boolean(supabaseServiceKey);

if (!supabaseUrl || !supabaseKey) {
  console.warn('[Supabase Server] Missing URL or Key in .env');
}

const supabase = createClient(supabaseUrl || '', supabaseKey || '');

module.exports = { supabase, supabaseUsesServiceRole };
