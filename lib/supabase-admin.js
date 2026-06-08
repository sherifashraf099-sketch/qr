import { createClient } from '@supabase/supabase-js';

// Service-role client — only use in API routes (server-side), never in client components
export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
