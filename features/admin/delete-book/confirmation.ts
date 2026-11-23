/** Same title the way a person types it: no case, no outer or doubled spaces, composed letters. */
const normalise = (text: string) =>
  text.normalize('NFC').replace(/\s+/g, ' ').trim().toLocaleLowerCase('uk');

/**
 * Typed confirmation for deleting a book (canvas: AdminDelete): the admin types the title.
 * The browser uses it to enable the button and the server checks it again.
 */
export function confirmationMatches(typed: string, title: string): boolean {
  const expected = normalise(title);
  return expected !== '' && normalise(typed) === expected;
}
