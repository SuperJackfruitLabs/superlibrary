// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import ConfirmDialog from './ConfirmDialog.svelte';

const key = (k: string, shift = false) => {
  const e = new KeyboardEvent('keydown', { key: k, shiftKey: shift, bubbles: true, cancelable: true });
  (document.activeElement ?? document.body).dispatchEvent(e);
  return e;
};

function open(extra: Record<string, unknown> = {}) {
  document.body.innerHTML = '<header><a href="/">Home</a></header><main><button id="opener">Revoke</button><div id="host"></div></main><footer inert>already inert</footer>';
  const opener = document.getElementById('opener') as HTMLButtonElement;
  opener.focus();
  const props = { title: 'Revoke version 3?', message: 'Nobody will be able to view version 3.', action: 'Revoke version 3', onconfirm: vi.fn(), oncancel: vi.fn(), ...extra };
  const c = mount(ConfirmDialog, { target: document.getElementById('host')!, props });
  mounted.push(c);
  flushSync();
  const dialog = document.querySelector<HTMLElement>('[role=alertdialog]')!;
  const buttons = [...dialog.querySelectorAll('button')];
  return { c, props, opener, dialog, buttons };
}

const mounted: ReturnType<typeof mount>[] = [];
afterEach(() => {
  for (const c of mounted.splice(0)) { try { unmount(c); } catch { /* already unmounted by the test */ } }
  document.body.innerHTML = '';
});

describe('the confirmation dialog (no browser confirm or prompt)', () => {
  it('is a named modal dialog whose action says exactly what it does', () => {
    const { dialog, buttons } = open();
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(document.getElementById(dialog.getAttribute('aria-labelledby')!)!.textContent).toBe('Revoke version 3?');
    expect(document.getElementById(dialog.getAttribute('aria-describedby')!)!.textContent).toContain('Nobody will be able to view version 3.');
    expect(buttons.map((b) => b.textContent?.trim())).toEqual(['Cancel', 'Revoke version 3']);
  });

  it('starts on Cancel, the safe choice, even with a reason field before it', () => {
    const { buttons } = open();
    expect(document.activeElement).toBe(buttons[0]);
    const again = open({ reason: true });
    expect(document.activeElement).toBe(again.buttons[0]);
  });

  it('makes the rest of the page inert, at every level, and leaves what was already inert alone', () => {
    const { c, dialog } = open();
    expect(document.querySelector('header')!.hasAttribute('inert')).toBe(true);
    expect(document.getElementById('opener')!.hasAttribute('inert')).toBe(true);
    expect(dialog.closest('[inert]')).toBeNull();
    unmount(c);
    flushSync();
    expect(document.querySelector('header')!.hasAttribute('inert')).toBe(false);
    expect(document.getElementById('opener')!.hasAttribute('inert')).toBe(false);
    expect(document.querySelector('footer')!.hasAttribute('inert')).toBe(true);
  });

  it('keeps Tab and Shift+Tab inside', () => {
    const { buttons } = open();
    buttons[1]!.focus();
    expect(key('Tab').defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(buttons[0]);
    expect(key('Tab', true).defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(buttons[1]);
    buttons[0]!.focus();
    // Moved here even mid-way: WebKit skips buttons and would leave the dialog for <body>.
    expect(key('Tab').defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(buttons[1]);
  });

  it('brings focus back if it lands outside', () => {
    const { buttons } = open();
    document.querySelector<HTMLElement>('header a')!.focus();
    expect(document.activeElement).toBe(buttons[0]);
  });

  it('Escape cancels, and is consumed', () => {
    const { props } = open();
    const e = key('Escape');
    expect(props.oncancel).toHaveBeenCalledOnce();
    expect(e.defaultPrevented).toBe(true);
  });

  it('Escape does nothing while the action is under way', () => {
    const { props } = open({ busy: true });
    key('Escape');
    expect(props.oncancel).not.toHaveBeenCalled();
  });

  it('a dialog no longer in the page leaves keys alone', () => {
    const { props } = open();
    document.body.innerHTML = '<button id="b">b</button>';
    (document.getElementById('b') as HTMLButtonElement).focus();
    const e = key('Escape');
    expect(e.defaultPrevented).toBe(false);
    expect(props.oncancel).not.toHaveBeenCalled();
  });

  it('returns focus to the control the page names, when the click did not focus it (Safari)', () => {
    document.body.innerHTML = '<button id="named">Revoke</button><div id="host"></div>';
    const named = document.getElementById('named') as HTMLButtonElement;
    (document.activeElement as HTMLElement | null)?.blur();
    const c = mount(ConfirmDialog, { target: document.getElementById('host')!, props: { title: 't', message: 'm', action: 'a', opener: named, onconfirm: () => {}, oncancel: () => {} } });
    flushSync();
    unmount(c);
    flushSync();
    expect(document.activeElement).toBe(named);
  });

  it('returns focus to the control that opened it', () => {
    const { c, opener } = open();
    unmount(c);
    flushSync();
    expect(document.activeElement).toBe(opener);
  });

  it('the action passes the optional reason; Cancel cancels', () => {
    const { props, dialog, buttons } = open({ reason: true });
    const field = dialog.querySelector('textarea')!;
    expect(dialog.querySelector('label')!.textContent).toContain('Why? (optional)');
    field.value = '  wrong file ';
    field.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();
    dialog.querySelectorAll('button')[1]!.click();
    expect(props.onconfirm).toHaveBeenCalledWith('wrong file');
    buttons[0]!.click();
    expect(props.oncancel).toHaveBeenCalledOnce();
  });

  it('shows a refusal inside the dialog', () => {
    const { dialog } = open({ error: 'Only the person who uploaded it, or an owner of the workspace, may do that.' });
    expect(dialog.querySelector('[role=alert]')!.textContent).toContain('Only the person who uploaded it');
  });
  it('a required reason keeps the act disabled until it is given, and says it is recorded', () => {
    const { dialog, props } = open({ reason: true, reasonRequired: true, action: 'Remove from memory' });
    const act = [...dialog.querySelectorAll('button')].find((b) => b.textContent === 'Remove from memory')!;
    expect(act.disabled).toBe(true);
    expect(dialog.textContent).toContain('required');
    const ta = dialog.querySelector('textarea')!;
    ta.value = 'posted twice';
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();
    expect(act.disabled).toBe(false);
    act.click();
    expect(props.onconfirm).toHaveBeenCalledWith('posted twice');
  });
});
