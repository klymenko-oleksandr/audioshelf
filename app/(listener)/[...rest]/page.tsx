import { notFound } from 'next/navigation';

/**
 * Any URL no other route matches. Calling `notFound()` here renders `../not-found.tsx` inside
 * the listener layout, so an unknown address still gets the shell and a real 404.
 */
export default function UnknownPage() {
  notFound();
}
