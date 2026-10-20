import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, UserPlus, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/layout/empty-state';
import { useCollaboration } from '@/hooks/use-collaboration';
import { useCurrentUser, useGroups } from '@/hooks';
import { normalizeEmail } from '@/domain/models/collaboration';

export function FriendsPage() {
  const navigate = useNavigate();
  const { user } = useCurrentUser();
  const { groups } = useGroups();
  const { friends, invitations, sendRequest, respond, cancelRequest, refresh, isBusy, error } = useCollaboration();
  const [email, setEmail] = useState('');
  const [search, setSearch] = useState('');
  const [message, setMessage] = useState('');
  const [localError, setLocalError] = useState('');
  const [selectedGroup, setSelectedGroup] = useState<Record<string, string>>({});
  const ownEmail = normalizeEmail(user?.email || '');
  const pending = invitations.filter(i => ['pending', 'accepted'].includes(i.status));
  const managedGroups = groups.filter(g => g.createdBy === user?.id && !g.isArchived);
  const run = async (action: () => Promise<unknown>, success = '') => {
    setMessage(''); setLocalError('');
    try { await action(); setMessage(success); } catch (err) { setLocalError(err instanceof Error ? err.message : 'Request failed. Please retry.'); }
  };
  return (
    <div className="space-y-6 pb-16">
      <PageHeader title="Friends" description="Split expenses together. Each friendship has a private shared ledger; groups have their own separate ledger."
        actions={<Button variant="outline" disabled={isBusy} onClick={() => void run(refresh)}><RefreshCw className="h-4 w-4 mr-2" />Refresh requests</Button>} />
      <form className="rounded-3xl border bg-card p-5 space-y-3" onSubmit={e => {
        e.preventDefault(); void run(async () => { await sendRequest({ email }); setEmail(''); }, 'Request sent by Google Drive email. Your friend can accept in Tabby → Friends.');
      }}>
        <label htmlFor="friend-email" className="font-bold">Send a friend request</label>
        <p className="text-sm text-muted-foreground">Use their Google sign-in email. They can accept or decline before either of you can share expenses.</p>
        <div className="flex flex-col sm:flex-row gap-3">
          <Input id="friend-email" type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="friend@gmail.com" />
          <Button disabled={isBusy || !email.trim()}><UserPlus className="h-4 w-4 mr-2" />Send request</Button>
        </div>
      </form>
      {(localError || error) && <p role="alert" className="text-sm text-destructive">{localError || error?.message}</p>}
      {message && <p role="status" className="text-sm text-primary">{message}</p>}
      <section className="space-y-3" aria-label="Collaboration requests">
        <h2 className="text-lg font-bold">Requests ({pending.length})</h2>
        <p className="text-sm text-muted-foreground">After acceptance, the sender must open Tabby and sync to activate access. Requests refresh while connected to Google.</p>
        {pending.length === 0 && <p className="text-sm text-muted-foreground">No pending requests.</p>}
        {pending.map(i => {
          const incoming = normalizeEmail(i.recipientEmail) === ownEmail;
          return <div key={i.id} className="rounded-2xl border bg-card p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0"><p className="font-semibold break-all">{incoming ? i.sender.name || i.sender.email : i.recipientEmail}</p>
              <p className="text-sm text-muted-foreground">{i.kind === 'friend' ? 'Friend request · private expense ledger' : `Group invitation · ${i.groupName}`}</p>
              <p className="text-xs mt-1">{i.status === 'accepted' ? 'Accepted · waiting for owner to activate access' : incoming ? 'Received · awaiting your response' : 'Sent · awaiting acceptance'}</p>
            </div>
            <div className="flex gap-2">{incoming && i.status === 'pending' ? <>
              <Button disabled={isBusy} onClick={() => void run(() => respond({ id: i.id, accept: true }), 'Accepted. The sender will activate access on their next sync.')}>Accept</Button>
              <Button variant="outline" disabled={isBusy} onClick={() => void run(() => respond({ id: i.id, accept: false }))}>Decline</Button>
            </> : !incoming && <Button variant="outline" disabled={isBusy} onClick={() => void run(() => cancelRequest(i.id))}>Cancel request</Button>}</div>
          </div>;
        })}
        {invitations.filter(i => ['declined', 'cancelled'].includes(i.status)).map(i => <p key={i.id} className="text-sm text-muted-foreground break-all">{i.sender.email === ownEmail ? i.recipientEmail : i.sender.email} · {i.kind} request {i.status}</p>)}
      </section>
      <section className="space-y-3">
        <h2 className="text-lg font-bold">Your friends ({friends.length})</h2>
        {!!friends.length && <Input aria-label="Search friends" placeholder="Search name or email" value={search} onChange={e => setSearch(e.target.value)} />}
        {!friends.length && <EmptyState icon={<Users className="h-6 w-6" />} title="Your next shared expense starts here" description="Send a request above. Accepted friends appear here once access is activated." />}
        {friends.filter(f => `${f.person.name} ${f.person.email}`.toLowerCase().includes(search.toLowerCase())).map(({ person, invitation }) => <div key={invitation.id} className="rounded-3xl border bg-card p-5 space-y-4">
          <div><h3 className="font-bold">{person.name || person.email}</h3><p className="text-sm text-muted-foreground break-all">{person.email}</p></div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => navigate(`/expenses/new?groupId=${invitation.sourceId}`)}>Add shared expense</Button>
            <Button variant="outline" onClick={() => navigate(`/groups/${invitation.sourceId}`)}>View shared ledger</Button>
            <Button variant="outline" onClick={() => navigate(`/settlements/new?groupId=${invitation.sourceId}`)}>Settle up</Button>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <select aria-label={`Group for ${person.name || person.email}`} className="min-w-0 rounded-xl border bg-background p-2 text-sm" value={selectedGroup[person.id] || ''} onChange={e => setSelectedGroup({ ...selectedGroup, [person.id]: e.target.value })}>
              <option value="">Choose a group you own</option>{managedGroups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
            <Button variant="outline" disabled={isBusy || !selectedGroup[person.id]} onClick={() => void run(() => sendRequest({ email: person.email, groupId: selectedGroup[person.id] }), 'Group invitation sent. Membership starts after acceptance and activation.')}>Invite to group</Button>
          </div>
        </div>)}
      </section>
    </div>
  );
}
export default FriendsPage;
