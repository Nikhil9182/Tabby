import { afterEach, beforeEach, expect, it } from 'vitest';
import { DELETION_STATE_KEY, isDeletingAccount, markAccountErased, resumeAfterErasure, setDeletingAccount } from './deletion-state';
beforeEach(() => setDeletingAccount(false));
afterEach(() => setDeletingAccount(false));
it('recognizes deletion started in another tab', () => {
  localStorage.setItem(DELETION_STATE_KEY, 'paused');
  expect(isDeletingAccount()).toBe(true);
});
it('keeps an incomplete deletion paused when signing in again', () => {
  setDeletingAccount(true);
  resumeAfterErasure();
  expect(isDeletingAccount()).toBe(true);
  expect(localStorage.getItem(DELETION_STATE_KEY)).toBe('paused');
});
it('allows an explicit new start after successful erasure', () => {
  setDeletingAccount(true);
  markAccountErased();
  resumeAfterErasure();
  expect(isDeletingAccount()).toBe(false);
  expect(localStorage.getItem(DELETION_STATE_KEY)).toBeNull();
});
