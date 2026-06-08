import { createClient } from '@supabase/supabase-js';

// Anon client — safe for server components (read-only queries)
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);
