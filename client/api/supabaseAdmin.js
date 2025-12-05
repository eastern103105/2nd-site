import { createClient } from '@supabase/supabase-js';

// Access env vars. In Vercel, these are process.env.
// We need Service Role Key for Admin operations (bypass RLS, manage users).
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing Supabase Environment Variables');
}

// Create a Supabase client with the SERVICE ROLE key
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
});
