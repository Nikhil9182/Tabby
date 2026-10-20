import { useState } from "react";
import { useCollaboration } from '@/hooks/use-collaboration';
import { useGroup } from '@/hooks/use-groups';
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeftRight, Check, AlertCircle } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useSettlements } from "@/hooks/use-settlements";
import { useUsers, useCurrentUser } from "@/hooks/use-users";
import { useAuth } from "@/hooks/use-auth";

export function SettlementNewPage() {
  const navigate = useNavigate();
  const { recordSettlement, isRecording } = useSettlements();
  const { users } = useUsers();
  const { user: currentUser } = useCurrentUser();
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const groupId = searchParams.get('groupId') || undefined;
  const { members } = useGroup(groupId || '');
  const { friends } = useCollaboration();
  const eligibleUsers = groupId
    ? users.filter(u => members.some(m => m.userId === u.id && (!m.status || m.status === 'active')))
    : users.filter(u => u.isCurrentUser || friends.some(f => f.person.id === u.id));

  const currentId = currentUser?.id || user?.sub || "user_self";
  const paramToUser = searchParams.get("toUserId");
  const paramAmountMinor = searchParams.get("amountMinor");
  const initialAmount = paramAmountMinor ? (parseInt(paramAmountMinor, 10) / 100).toFixed(2) : "";

  const [fromUser, setFromUser] = useState(searchParams.get('fromUserId') || '');
  const [toUser, setToUser] = useState(paramToUser || "");
  const [amountStr, setAmountStr] = useState(initialAmount || "");
  const [currency, setCurrency] = useState("USD");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const amountFloat = parseFloat(amountStr);
    const payerId = fromUser || currentId;
    if (!toUser.trim()) {
      setFormError("Recipient user is required");
      return;
    }
    if (payerId === toUser) {
      setFormError("Payer and recipient cannot be the same user");
      return;
    }
    if (isNaN(amountFloat) || amountFloat <= 0) {
      setFormError("Please enter a valid amount greater than 0");
      return;
    }

    const amountMinor = Math.round(amountFloat * 100);

    try {
      const otherId = payerId === currentId ? toUser : payerId;
      const ledgerId = groupId || friends.find(f => f.person.id === otherId)?.invitation.sourceId;
      if (!ledgerId) throw new Error('Select an accepted friend or an active group to settle up.');
      await recordSettlement({
        groupId: ledgerId,
        fromUserId: payerId,
        toUserId: toUser.trim(),
        amountMinor,
        currency: currency.toUpperCase(),
        settlementDate: new Date(date).toISOString(),
        notes: notes.trim() || undefined,
        createdBy: currentId,
      });
      navigate("/settlements");
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : "Failed to record settlement");
    }
  };

  return (
    <div className="max-w-xl mx-auto space-y-6 animate-in fade-in-50 duration-300">
      <PageHeader
        title="Record Settlement"
        description="Mark a repayment between members to clear debts and balance the ledger."
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Settlements", href: "/settlements" },
          { label: "Record" },
        ]}
      />

      <Card className="rounded-2xl border-border bg-card shadow-xs">
        <CardHeader>
          <CardTitle className="text-base font-semibold">Payment Details</CardTitle>
          <CardDescription>
            Settlements directly adjust user balances without creating new expense shares.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {formError && (
              <div className="flex items-center gap-2 p-3 rounded-xl bg-destructive/10 text-destructive text-xs border border-destructive/20">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="fromUser" className="text-xs font-semibold">
                  Paid By (Sender)
                </Label>
                <select className="w-full rounded-xl border bg-background p-2"
                  id="fromUser"
                  value={fromUser || currentId}
                  onChange={(e) => setFromUser(e.target.value)}
                  required
                ><option value="">Choose payer</option>{eligibleUsers.map(u => <option key={u.id} value={u.id}>{u.id === currentId ? 'You' : u.name || u.email}</option>)}</select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="toUser" className="text-xs font-semibold">
                  Paid To (Recipient)
                </Label>
                <select className="w-full rounded-xl border bg-background p-2"
                  id="toUser"
                  value={toUser}
                  onChange={(e) => setToUser(e.target.value)}
                  required
                ><option value="">Choose recipient</option>{eligibleUsers.map(u => <option key={u.id} value={u.id}>{u.id === currentId ? 'You' : u.name || u.email}</option>)}</select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="amount" className="text-xs font-semibold">
                  Amount
                </Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                    $
                  </span>
                  <Input
                    id="amount"
                    type="number"
                    step="0.01"
                    min="0.01"
                    placeholder="0.00"
                    value={amountStr}
                    onChange={(e) => setAmountStr(e.target.value)}
                    className="pl-7"
                    required
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="currency" className="text-xs font-semibold">
                  Currency
                </Label>
                <Input
                  id="currency"
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                  maxLength={3}
                  placeholder="USD"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="date" className="text-xs font-semibold">
                Settlement Date
              </Label>
              <Input
                id="date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="notes" className="text-xs font-semibold">
                Notes (Optional)
              </Label>
              <Textarea
                id="notes"
                placeholder="e.g. Paid via Venmo / Cash / Bank Transfer"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
              />
            </div>

            <div className="pt-4 flex items-center justify-end gap-3 border-t border-border/60">
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate("/settlements")}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isRecording} className="gap-2">
                <Check className="h-4 w-4" />
                {isRecording ? "Recording..." : "Record Settlement"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

export default SettlementNewPage;
