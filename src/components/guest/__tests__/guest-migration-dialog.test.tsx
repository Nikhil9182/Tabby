import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GuestMigrationDialog } from '../guest-migration-dialog';
import { useAuth } from '@/hooks/use-auth';
import { guestMigrationService } from '@/services/guest/guest-migration-service';

vi.mock('@/hooks/use-auth');
vi.mock('@/services/guest/guest-migration-service');

describe('GuestMigrationDialog', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
  });

  const renderComponent = () =>
    render(
      <QueryClientProvider client={queryClient}>
        <GuestMigrationDialog />
      </QueryClientProvider>
    );

  it('does not render if user is not authenticated', async () => {
    vi.mocked(useAuth).mockReturnValue({
      isAuthenticated: false,
      user: null,
      isGuest: true,
    } as any);

    renderComponent();

    expect(screen.queryByText(/Merge or Discard/i)).toBeNull();
  });

  it('renders merge/discard choices when signing in to an existing account with guest data', async () => {
    vi.mocked(useAuth).mockReturnValue({
      isAuthenticated: true,
      user: { id: 'u1', email: 'existing@example.com' },
      isGuest: false,
    } as any);

    vi.mocked(guestMigrationService.checkAccountState).mockResolvedValue({
      hasGuestData: true,
      isExistingAccount: true,
      guestSummary: {
        expensesCount: 4,
        groupsCount: 2,
        friendsCount: 3,
        settlementsCount: 1,
      },
    });

    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Merge or Discard Guest Data?')).toBeTruthy();
    });

    expect(screen.getByText('4')).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy();
    expect(screen.getByText('3')).toBeTruthy();
    expect(screen.getByText('1')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Merge Guest Data/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Discard Guest Data/i })).toBeTruthy();
  });

  it('calls migrateGuestData when user clicks Merge Guest Data', async () => {
    const user = userEvent.setup();

    vi.mocked(useAuth).mockReturnValue({
      isAuthenticated: true,
      user: { id: 'u1', email: 'existing@example.com' },
      isGuest: false,
    } as any);

    vi.mocked(guestMigrationService.checkAccountState).mockResolvedValue({
      hasGuestData: true,
      isExistingAccount: true,
      guestSummary: {
        expensesCount: 2,
        groupsCount: 1,
        friendsCount: 1,
        settlementsCount: 0,
      },
    });

    vi.mocked(guestMigrationService.migrateGuestData).mockResolvedValue({
      success: true,
      migratedFriends: 1,
      migratedGroups: 1,
      migratedExpenses: 2,
      migratedSettlements: 0,
    });

    renderComponent();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Merge Guest Data/i })).toBeTruthy();
    });

    await user.click(screen.getByRole('button', { name: /Merge Guest Data/i }));

    expect(guestMigrationService.migrateGuestData).toHaveBeenCalledWith('u1');
  });

  it('calls discardGuestData when user clicks Discard Guest Data', async () => {
    const user = userEvent.setup();

    vi.mocked(useAuth).mockReturnValue({
      isAuthenticated: true,
      user: { id: 'u1', email: 'existing@example.com' },
      isGuest: false,
    } as any);

    vi.mocked(guestMigrationService.checkAccountState).mockResolvedValue({
      hasGuestData: true,
      isExistingAccount: true,
      guestSummary: {
        expensesCount: 2,
        groupsCount: 1,
        friendsCount: 1,
        settlementsCount: 0,
      },
    });

    vi.mocked(guestMigrationService.discardGuestData).mockResolvedValue();

    renderComponent();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Discard Guest Data/i })).toBeTruthy();
    });

    await user.click(screen.getByRole('button', { name: /Discard Guest Data/i }));

    expect(guestMigrationService.discardGuestData).toHaveBeenCalled();
  });

  it('shows error and retry button if migration fails', async () => {
    const user = userEvent.setup();

    vi.mocked(useAuth).mockReturnValue({
      isAuthenticated: true,
      user: { id: 'u1', email: 'user@example.com' },
      isGuest: false,
    } as any);

    vi.mocked(guestMigrationService.checkAccountState).mockResolvedValue({
      hasGuestData: true,
      isExistingAccount: false,
      guestSummary: {
        expensesCount: 1,
        groupsCount: 0,
        friendsCount: 0,
        settlementsCount: 0,
      },
    });

    vi.mocked(guestMigrationService.migrateGuestData).mockRejectedValueOnce(
      new Error('Network connection dropped')
    );

    renderComponent();

    await waitFor(() => {
      expect(screen.getByText(/Network connection dropped/i)).toBeTruthy();
    });

    const retryBtn = screen.getByRole('button', { name: /Retry Migration/i });
    expect(retryBtn).toBeTruthy();

    vi.mocked(guestMigrationService.migrateGuestData).mockResolvedValueOnce({
      success: true,
      migratedFriends: 0,
      migratedGroups: 0,
      migratedExpenses: 1,
      migratedSettlements: 0,
    });

    await user.click(retryBtn);
    expect(guestMigrationService.migrateGuestData).toHaveBeenCalledTimes(2);
  });
});
