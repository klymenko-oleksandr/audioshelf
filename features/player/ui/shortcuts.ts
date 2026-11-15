/**
 * Keyboard shortcuts (PRD): Space play/pause, ←/→ skip back 15 s / forward 30 s,
 * Shift+←/→ previous / next chapter.
 *
 * Pure: decides what a key press means from the key and what has focus, so the rules are
 * testable. A shortcut never steals a key from the control that has focus.
 */

export type PlayerShortcut =
  'toggle' | 'skipBack' | 'skipForward' | 'previousChapter' | 'nextChapter';

export interface KeyPress {
  key: string;
  shiftKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  repeat?: boolean;
  /** What has focus. */
  target?: {
    tagName?: string;
    type?: string;
    role?: string | null;
    isContentEditable?: boolean;
  } | null;
}

/** Input types that take no text: Space and arrows mean something else there, or nothing. */
const NON_TEXT_INPUTS = new Set([
  'button',
  'checkbox',
  'radio',
  'range',
  'submit',
  'reset',
  'file',
  'color',
  'image',
]);
/** Space activates these. */
const SPACE_ROLES = new Set([
  'button',
  'link',
  'checkbox',
  'radio',
  'switch',
  'tab',
  'menuitem',
  'menuitemradio',
  'menuitemcheckbox',
  'option',
  'slider',
]);
/** Arrow keys move inside these. */
const ARROW_ROLES = new Set([
  'slider',
  'radio',
  'tab',
  'menuitem',
  'menuitemradio',
  'menuitemcheckbox',
  'option',
  'listbox',
  'menu',
  'spinbutton',
]);

export function shortcutFor(press: KeyPress): PlayerShortcut | null {
  if (press.ctrlKey || press.metaKey || press.altKey) return null;

  const tag = press.target?.tagName?.toLowerCase() ?? '';
  const type = press.target?.type?.toLowerCase() ?? '';
  const role = press.target?.role ?? '';

  const typing =
    press.target?.isContentEditable === true ||
    tag === 'textarea' ||
    tag === 'select' ||
    (tag === 'input' && !NON_TEXT_INPUTS.has(type));
  if (typing) return null;

  if (press.key === ' ' || press.key === 'Spacebar') {
    if (press.shiftKey || press.repeat) return null;
    const activates =
      tag === 'button' ||
      tag === 'a' ||
      tag === 'summary' ||
      tag === 'input' ||
      SPACE_ROLES.has(role);
    return activates ? null : 'toggle';
  }

  if (press.key === 'ArrowLeft' || press.key === 'ArrowRight') {
    const moves =
      (tag === 'input' && (type === 'range' || type === 'radio')) || ARROW_ROLES.has(role);
    if (moves) return null;
    const forward = press.key === 'ArrowRight';
    if (press.shiftKey) return forward ? 'nextChapter' : 'previousChapter';
    return forward ? 'skipForward' : 'skipBack';
  }

  return null;
}
