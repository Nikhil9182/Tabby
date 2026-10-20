let deleting = false;
export const DELETION_STATE_KEY = 'tabby_deletion_state';
const savedState = () => typeof localStorage === 'undefined' ? null : localStorage.getItem(DELETION_STATE_KEY);
export const isDeletingAccount = () => deleting || savedState() === 'paused' || savedState() === 'erased';
export const setDeletingAccount = (value: boolean) => {
  deleting = value;
  if (typeof localStorage !== 'undefined') {
    if (value) localStorage.setItem(DELETION_STATE_KEY, 'paused');
    else localStorage.removeItem(DELETION_STATE_KEY);
  }
};
export const markAccountErased = () => { localStorage.setItem(DELETION_STATE_KEY, 'erased'); };
export const resumeAfterErasure = () => { if (savedState() === 'erased') setDeletingAccount(false); };
