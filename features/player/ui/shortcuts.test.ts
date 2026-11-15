import { describe, expect, it } from 'vitest';
import { shortcutFor } from './shortcuts';

describe('shortcutFor', () => {
  it('maps the PRD shortcuts when nothing interactive has focus', () => {
    const target = { tagName: 'BODY' };
    expect(shortcutFor({ key: ' ', target })).toBe('toggle');
    expect(shortcutFor({ key: 'ArrowLeft', target })).toBe('skipBack');
    expect(shortcutFor({ key: 'ArrowRight', target })).toBe('skipForward');
    expect(shortcutFor({ key: 'ArrowLeft', shiftKey: true, target })).toBe('previousChapter');
    expect(shortcutFor({ key: 'ArrowRight', shiftKey: true, target })).toBe('nextChapter');
    expect(shortcutFor({ key: 'ArrowRight' })).toBe('skipForward');
  });

  it('ignores other keys and browser / OS combinations', () => {
    expect(shortcutFor({ key: 'k' })).toBeNull();
    expect(shortcutFor({ key: 'ArrowUp' })).toBeNull();
    expect(shortcutFor({ key: 'ArrowLeft', altKey: true })).toBeNull(); // browser Back
    expect(shortcutFor({ key: 'ArrowRight', metaKey: true })).toBeNull();
    expect(shortcutFor({ key: ' ', ctrlKey: true })).toBeNull();
    expect(shortcutFor({ key: ' ', shiftKey: true })).toBeNull(); // scroll up
  });

  it('does not toggle over and over while Space is held', () => {
    expect(shortcutFor({ key: ' ', repeat: true })).toBeNull();
  });

  it('never fires while typing', () => {
    for (const target of [
      { tagName: 'INPUT', type: 'text' },
      { tagName: 'INPUT', type: 'search' },
      { tagName: 'INPUT', type: '' },
      { tagName: 'TEXTAREA' },
      { tagName: 'SELECT' },
      { tagName: 'DIV', isContentEditable: true },
    ]) {
      expect(shortcutFor({ key: ' ', target })).toBeNull();
      expect(shortcutFor({ key: 'ArrowLeft', target })).toBeNull();
    }
  });

  it('leaves Space to the focused button, link or control', () => {
    for (const target of [
      { tagName: 'BUTTON' },
      { tagName: 'A' },
      { tagName: 'INPUT', type: 'range' },
      { tagName: 'INPUT', type: 'checkbox' },
      { tagName: 'DIV', role: 'menuitem' },
      { tagName: 'DIV', role: 'switch' },
    ]) {
      expect(shortcutFor({ key: ' ', target })).toBeNull();
    }
  });

  it('leaves arrows to sliders, radios, tabs and menus, but not to plain buttons', () => {
    for (const target of [
      { tagName: 'INPUT', type: 'range' },
      { tagName: 'INPUT', type: 'radio' },
      { tagName: 'BUTTON', role: 'radio' },
      { tagName: 'BUTTON', role: 'tab' },
      { tagName: 'DIV', role: 'menuitem' },
    ]) {
      expect(shortcutFor({ key: 'ArrowRight', target })).toBeNull();
    }
    expect(shortcutFor({ key: 'ArrowRight', target: { tagName: 'BUTTON' } })).toBe('skipForward');
    expect(shortcutFor({ key: 'ArrowLeft', target: { tagName: 'A' } })).toBe('skipBack');
  });
});
