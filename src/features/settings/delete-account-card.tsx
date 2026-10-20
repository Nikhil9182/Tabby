import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { accountDeletionService, type DeletionPlan } from '@/services/account/account-deletion-service';
import { useAuth } from '@/hooks/use-auth';
import { isSharedTabbyLedger } from '@/services/drive/google-drive-service';
import { isDeletingAccount } from '@/services/account/deletion-state';

export function DeleteAccountCard() {
  const { isAuthenticated, signIn } = useAuth();
  const queryClient = useQueryClient();
  const [scope, setScope] = useState<DeletionPlan['scope']>('cloud');
  const [plan, setPlan] = useState<DeletionPlan | null>(null);
  const [confirmation, setConfirmation] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [started, setStarted] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const hasSharedFiles = !!plan?.files.some(isSharedTabbyLedger);
  const review = async () => {
    setBusy(true); setError(''); setStarted(false); setConfirmation(''); setAcknowledged(false);
    try { setPlan(await accountDeletionService.prepare(scope)); }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not prepare deletion.'); }
    finally { setBusy(false); }
  };
  const erase = async () => {
    if (!plan) return;
    setBusy(true); setStarted(true); setError('');
    try {
      await queryClient.cancelQueries();
      await accountDeletionService.execute(plan, confirmation, acknowledged, setProgress);
      queryClient.clear();
      window.location.replace(`${import.meta.env.BASE_URL}welcome`);
    } catch (err) {
      const paused = isDeletingAccount();
      setStarted(paused);
      setError(`${err instanceof Error ? err.message : 'Deletion could not finish.'}${paused ? ' Sync is paused to prevent erased data from being uploaded again. Retry to finish. Some Drive files may already have been deleted.' : ' Review the account and try again.'}`);
    } finally { setBusy(false); }
  };
  return <section className="rounded-3xl border border-destructive/30 bg-card p-5 sm:p-6 space-y-4" aria-labelledby="delete-account-title">
    <h2 id="delete-account-title" className="text-lg font-bold text-destructive">Delete Tabby account & erase data</h2>
    <p className="text-sm text-muted-foreground">Remove your Tabby profile and data. Your Google account is unaffected. Download a backup above if you want to keep a copy.</p>
    <fieldset className="space-y-3 text-sm">
      <legend className="mb-2 font-semibold">What should be erased?</legend>
      <label className="flex items-start gap-3"><input className="mt-1" type="radio" name="deletion-scope" checked={scope === 'cloud'} onChange={() => setScope('cloud')} />
        <span><strong>This device and my owned Google Drive data</strong><span className="block text-muted-foreground">Permanently delete owned Tabby spreadsheets and invitations, including owned shared ledgers. Requires your Google connection.</span></span></label>
      <label className="flex items-start gap-3"><input className="mt-1" type="radio" name="deletion-scope" checked={scope === 'device'} onChange={() => setScope('device')} />
        <span><strong>This device only</strong><span className="block text-muted-foreground">Erase the local profile, expenses, requests, settings, and sync queue. Google Drive data remains and can return if you reconnect.</span></span></label>
    </fieldset>
    {scope === 'cloud' && !isAuthenticated && <p className="text-sm text-muted-foreground">Connect Google in the section above to review cloud deletion.</p>}
    {error && <p role="alert" className="text-sm text-destructive break-words">{error}</p>}
    <Button variant="destructive" disabled={busy || (scope === 'cloud' && !isAuthenticated)} onClick={() => void review()}><Trash2 className="h-4 w-4 mr-2" />{busy && !plan ? 'Preparing…' : 'Review deletion'}</Button>
    <Dialog open={!!plan} onOpenChange={open => { if (!open && !busy && !started) setPlan(null); }}>
      <DialogContent showCloseButton={!started && !busy} onEscapeKeyDown={e => { if (busy || started) e.preventDefault(); }} onPointerDownOutside={e => { if (busy || started) e.preventDefault(); }}>
        <DialogHeader><DialogTitle>Erase your Tabby data?</DialogTitle><DialogDescription>
          {plan?.scope === 'cloud' ? `This permanently deletes ${plan.files.length} owned Tabby file(s) for ${plan.accountEmail}, then erases this device. This cannot be undone.` : 'This erases all Tabby data stored in this browser and disconnects Google. Cloud data is retained.'}
        </DialogDescription></DialogHeader>
        {!!plan?.files.length && <ul aria-label="Files selected for deletion" className="max-h-32 overflow-y-auto rounded-xl border p-3 text-xs space-y-2">{plan.files.map(file => <li className="break-all" key={file.id}>{file.name}</li>)}</ul>}
        <p className="text-sm text-muted-foreground">Files owned by other people, their historical records, and copies on other devices remain. This does not delete your Google account.</p>
        {hasSharedFiles && <label className="flex items-start gap-3 text-sm"><input className="mt-1" type="checkbox" checked={acknowledged} disabled={busy || started} onChange={e => setAcknowledged(e.target.checked)} /><span>I understand that deleting my owned shared ledgers also removes access for friends and group members.</span></label>}
        <label className="space-y-2 text-sm font-semibold">Type DELETE to confirm<Input aria-label="Type DELETE to confirm" autoComplete="off" value={confirmation} disabled={busy || started} onChange={e => setConfirmation(e.target.value)} /></label>
        {progress && <p role="status" className="text-sm">{progress}</p>}
        {error && <p role="alert" className="text-sm text-destructive break-words">{error}</p>}
        <DialogFooter>
          {started && error && plan?.scope === 'cloud' && !isAuthenticated && <Button variant="outline" disabled={busy} onClick={() => void signIn().catch(err => setError(err instanceof Error ? err.message : 'Could not reconnect.'))}>Reconnect Google</Button>}
          {!started && <Button variant="outline" disabled={busy} onClick={() => setPlan(null)}>Cancel</Button>}
          <Button variant="destructive" disabled={busy || confirmation !== 'DELETE' || (hasSharedFiles && !acknowledged)} onClick={() => void erase()}>{busy ? 'Erasing…' : started ? 'Retry deletion' : 'Erase selected data'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </section>;
}
