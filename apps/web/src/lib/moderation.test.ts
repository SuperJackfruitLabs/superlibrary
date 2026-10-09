// apps/web/src/lib/moderation.test.ts
import { describe, expect, it } from 'vitest';
import { askRemove, askSupersede, parseItemRef } from './moderation';
import { explain } from './item';

describe('moderation helpers (spec §11)', () => {
  it('parseItemRef takes an id or an item link, and nothing else', () => {
    expect(parseItemRef(' itm_0123456789abcdef ')).toBe('itm_0123456789abcdef');
    expect(parseItemRef('https://app.superlibrary.dev/a/itm_0123456789abcdef/v/3')).toBe('itm_0123456789abcdef');
    expect(parseItemRef('http://localhost:5173/a/itm_0123456789abcdef?x=1')).toBe('itm_0123456789abcdef');
    expect(parseItemRef('itm_0123')).toBeNull();
    expect(parseItemRef('https://example.com/b/itm_0123456789abcdef')).toBeNull();
  });
  it('the confirmations name the act, and removal asks for a reason', () => {
    expect(askSupersede('Old plan', 'New plan')).toMatchObject({ title: 'Mark “Old plan” as superseded?', action: 'Mark as superseded' });
    expect(askRemove('Old plan', 'work-record')).toMatchObject({ action: 'Remove from memory', reason: true, required: true });
    expect(askRemove('Old plan', 'work-record').message).toContain('later changes to the card will not bring it back');
  });
  it('refusals read as sentences', () => {
    expect(explain('invalid', 'that would make a loop of replacements')).toBe('That would make a loop: the replacement is already marked as superseded by this item.');
    expect(explain('invalid', 'an item cannot supersede itself')).toBe('An item cannot replace itself.');
    expect(explain('not_found', 'the replacement was not found')).toBe('Nothing here, or you cannot see it.');
  });
});
