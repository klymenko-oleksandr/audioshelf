import { describe, expect, it } from 'vitest';
import { NEW_CHOICE } from '../book-form/values';
import { candidateFromSaved } from './candidate';

const raw = {
  title: ' Dracula ',
  author: 'a1',
  narrator: 'n1',
  category: 'c1',
};

describe('candidateFromSaved', () => {
  it('reads the saved form values and the number of ready tracks', () => {
    expect(candidateFromSaved(raw, 2)).toEqual({
      title: ' Dracula ',
      hasAuthor: true,
      hasCategory: true,
      hasNarrator: true,
      readyTracks: 2,
    });
  });

  it('treats empty choices as missing', () => {
    expect(candidateFromSaved({ title: 'T', author: '', narrator: '', category: '' }, 0)).toEqual({
      title: 'T',
      hasAuthor: false,
      hasCategory: false,
      hasNarrator: false,
      readyTracks: 0,
    });
  });

  it('counts "+ New…" as present only when a name was typed', () => {
    const named = candidateFromSaved(
      {
        ...raw,
        author: NEW_CHOICE,
        newAuthorName: 'X',
        narrator: NEW_CHOICE,
        newNarratorName: 'Y',
      },
      1,
    );
    expect(named).toMatchObject({ hasAuthor: true, hasNarrator: true });
    const blank = candidateFromSaved(
      { ...raw, author: NEW_CHOICE, newAuthorName: ' ', narrator: NEW_CHOICE },
      1,
    );
    expect(blank).toMatchObject({ hasAuthor: false, hasNarrator: false });
  });
});
