import { NextResponse, type NextRequest } from 'next/server';
import { resolveCallback } from '@/features/account/callback';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/** Where Google (through Supabase) sends the browser back: swap the code for a session cookie. */
export async function GET(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const target = await resolveCallback(request.url, async (code) => {
    if (!supabase) return { error: new Error('Sign-in is not configured.') };
    return supabase.auth.exchangeCodeForSession(code);
  });
  const response = NextResponse.redirect(target);
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}
