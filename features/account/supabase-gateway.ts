import type { SupabaseClient } from '@supabase/supabase-js';
import { callbackUrl } from './next';
import { WELCOME_SEEN_METADATA_KEY } from './account';
import type { AuthGateway } from './store';

/** The `AuthGateway` over the Supabase browser client. Kept thin: the rules live in the store. */
export function createSupabaseGateway(client: SupabaseClient, origin: () => string): AuthGateway {
  return {
    async loadUser() {
      const { data } = await client.auth.getSession();
      return data.session?.user ?? null;
    },

    onChange(callback) {
      const { data } = client.auth.onAuthStateChange((_event, session) => {
        callback(session?.user ?? null);
      });
      return () => data.subscription.unsubscribe();
    },

    async signInWithGoogle(next) {
      const { error } = await client.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: callbackUrl(origin(), next) },
      });
      return { error };
    },

    async signOut() {
      // This browser only: the listener's other devices stay signed in.
      const { error } = await client.auth.signOut({ scope: 'local' });
      if (error) throw error;
    },

    async markWelcomeSeen(at) {
      const { error } = await client.auth.updateUser({ data: { [WELCOME_SEEN_METADATA_KEY]: at } });
      if (error) throw error;
    },
  };
}
