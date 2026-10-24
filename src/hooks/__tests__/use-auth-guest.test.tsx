import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { AuthProvider, useAuth } from '../use-auth';
import { guestStore } from '@/services/guest/guest-store';

describe('useAuth in Guest Mode', () => {
  beforeEach(async () => {
    guestStore.setGuestMode(false);
    await guestStore.clearGuestData();
  });

  it('allows activating and exiting guest mode', async () => {
    const { result } = renderHook(() => useAuth(), {
      wrapper: ({ children }) => <AuthProvider>{children}</AuthProvider>,
    });

    await act(async () => {
      // allow initial auth check to resolve
      await new Promise((r) => setTimeout(r, 10));
    });

    expect(result.current.isGuest).toBe(false);
    expect(result.current.isAuthenticated).toBe(false);

    act(() => {
      result.current.continueAsGuest();
    });

    expect(result.current.isGuest).toBe(true);
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.user).not.toBeNull();
    expect(result.current.user?.name).toBe('Guest');

    act(() => {
      result.current.exitGuestMode();
    });

    expect(result.current.isGuest).toBe(false);
    expect(result.current.user).toBeNull();
  });

  it('signOut clears guest mode state', async () => {
    const { result } = renderHook(() => useAuth(), {
      wrapper: ({ children }) => <AuthProvider>{children}</AuthProvider>,
    });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    act(() => {
      result.current.continueAsGuest();
    });

    expect(result.current.isGuest).toBe(true);

    await act(async () => {
      await result.current.signOut();
    });

    expect(result.current.isGuest).toBe(false);
    expect(result.current.user).toBeNull();
  });
});
