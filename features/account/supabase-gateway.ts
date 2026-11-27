import type { SupabaseClient } from '@supabase/supabase-js';
import { callbackUrl } from './next';
import { WELCOME_SEEN_METADATA_KEY } from './account';
import type { AuthGateway } from './store';

/** The `AuthGateway` over the Supabase browser client. Kept thin: the rules live in the store. */
export function createSupabaseGateway(client: SupabaseClient, origin: () => string): AuthGateway {
  return {
    async loadUser() {
      const { data, error } = await client.auth.getSession();
      // Not the same as "signed out": offline with an expired token ends up here.
      if (error) throw error;
      return data.session?.user ?? null;
    },

    onChange(callback) {
      const { data } = client.auth.onAuthStateChange((event, session) => {
        // `loadUser` reads the first session; this event also says "nobody" when it failed.
        if (event === 'INITIAL_SESSION') return;
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
