import { useState, useMemo } from "react";
import { useGroup, useGroups } from "@/hooks/use-groups";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Check, AlertCircle, ArrowRight } from "lucide-react";
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
  const { groups } = useGroups();
  const { users } = useUsers();
  const { user: currentUser } = useCurrentUser();
  const { user } = useAuth();
  const [searchParams] = useSearchParams();

  const groupId = searchParams.get("groupId") || undefined;
  const { members } = useGroup(groupId || "");
  const eligibleUsers = useMemo(() => {
    return groupId
      ? users.filter((u) => members.some((m) => m.userId === u.id && (!m.status || m.status === "active")))
      : users;
  }, [groupId, users, members]);

  const currentId = currentUser?.id || user?.sub || "user_self";
  const paramFromUser = searchParams.get("fromUserId") || searchParams.get("from") || "";
  const paramToUser = searchParams.get("toUserId") || searchParams.get("to") || "";
  const paramAmountMinor = searchParams.get("amountMinor") || searchParams.get("amount") || "";
  const paramCurrency = searchParams.get("currency") || "USD";
  const returnTo = searchParams.get("returnTo");

  const initialAmount = paramAmountMinor ? (parseInt(paramAmountMinor, 10) / 100).toFixed(2) : "";

  const [fromUser, setFromUser] = useState(paramFromUser || currentId);
  const [toUser, setToUser] = useState(paramToUser || "");
  const [amountStr, setAmountStr] = useState(initialAmount || "");
  const [currency, setCurrency] = useState(paramCurrency.toUpperCase());
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const payerName = useMemo(() => {
    const id = fromUser || currentId;
    if (id === currentId) return currentUser?.name || "You";
    const found = users.find((u) => u.id === id);
    return found?.name || found?.email || "Payer";
  }, [fromUser, currentId, currentUser, users]);

  const recipientName = useMemo(() => {
    if (!toUser) return "Select recipient";
    if (toUser === currentId) return currentUser?.name || "You";
    const found = users.find((u) => u.id === toUser);
    return found?.name || found?.email || "Recipient";
  }, [toUser, currentId, currentUser, users]);

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
      const isDirect = !groupId;
      const otherUserId = payerId === currentId ? toUser.trim() : payerId;

      await recordSettlement({
        groupId: isDirect ? undefined : groupId,
        friendId: isDirect ? otherUserId : undefined,
        contextType: isDirect ? 'direct' : 'group',
        fromUserId: payerId,
        toUserId: toUser.trim(),
        amountMinor,
        currency: currency.toUpperCase(),
        settlementDate: new Date(date).toISOString(),
        notes: notes.trim() || undefined,
        createdBy: currentId,
      });

      if (returnTo) {
        navigate(returnTo);
      } else if (groupId) {
        navigate(`/groups/${groupId}?tab=balances`);
      } else if (toUser && toUser !== currentId) {
        navigate(`/friends?friendId=${toUser}`);
      } else {
        navigate("/settlements");
      }
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : "Failed to record settlement");
    }
  };

  const handleCancel = () => {
    if (returnTo) {
      navigate(returnTo);
    } else if (groupId) {
      navigate(`/groups/${groupId}?tab=balances`);
    } else if (toUser && toUser !== currentId) {
      navigate(`/friends?friendId=${toUser}`);
    } else {
      navigate(-1);
    }
  };

  return (
    <div className="max-w-xl mx-auto space-y-6 animate-in fade-in-50 duration-300">
      <PageHeader
        title="Record Settlement"
        description="Record a direct debt payment to balance the ledger."
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Settlements", href: "/settlements" },
          { label: "Record" },
        ]}
      />

      <Card className="rounded-3xl border-border bg-card shadow-xs">
        <CardHeader className="pb-4">
          <CardTitle className="text-base font-bold">Settlement Details</CardTitle>
          <CardDescription>
            Settlements directly balance user obligations without creating new expense shares.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Visual Payment Flow Card */}
          <div className="mb-6 p-4 rounded-2xl bg-muted/40 border border-border flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="h-9 w-9 rounded-full bg-primary/10 text-primary font-black flex items-center justify-center text-xs shrink-0">
                {payerName.slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="text-[11px] text-muted-foreground font-semibold uppercase">Payer (Sending)</p>
                <p className="text-sm font-bold text-foreground truncate">{payerName}</p>
              </div>
            </div>

            <div className="flex flex-col items-center shrink-0 px-2">
              <span className="text-xs font-black text-foreground">
                {amountStr ? `${currency} ${amountStr}` : "—"}
              </span>
              <ArrowRight className="h-4 w-4 text-primary stroke-[2.5]" />
            </div>

            <div className="flex items-center gap-2.5 min-w-0 text-right justify-end">
              <div className="min-w-0">
                <p className="text-[11px] text-muted-foreground font-semibold uppercase">Recipient (Receiving)</p>
                <p className="text-sm font-bold text-foreground truncate">{recipientName}</p>
              </div>
              <div className="h-9 w-9 rounded-full bg-emerald-500/10 text-emerald-600 font-black flex items-center justify-center text-xs shrink-0">
                {recipientName.slice(0, 2).toUpperCase()}
              </div>
            </div>
          </div>

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
                <select
                  className="w-full rounded-xl border bg-background p-2 text-sm"
                  id="fromUser"
                  value={fromUser}
                  onChange={(e) => setFromUser(e.target.value)}
                  required
                >
                  <option value="">Choose payer</option>
                  {eligibleUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.id === currentId ? "You" : u.name || u.email}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="toUser" className="text-xs font-semibold">
                  Paid To (Recipient)
                </Label>
                <select
                  className="w-full rounded-xl border bg-background p-2 text-sm"
                  id="toUser"
                  value={toUser}
                  onChange={(e) => setToUser(e.target.value)}
                  required
                >
                  <option value="">Choose recipient</option>
                  {eligibleUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.id === currentId ? "You" : u.name || u.email}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="amount" className="text-xs font-semibold">
                  Amount
                </Label>
                <Input
                  id="amount"
                  type="number"
                  step="0.01"
                  min="0.01"
                  placeholder="0.00"
                  value={amountStr}
                  onChange={(e) => setAmountStr(e.target.value)}
                  className="rounded-xl"
                  required
                />
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
                  className="rounded-xl uppercase font-mono"
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
                className="rounded-xl"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="notes" className="text-xs font-semibold">
                Notes (Optional)
              </Label>
              <Textarea
                id="notes"
                placeholder="e.g. Paid via UPI, Cash, Venmo, Bank Transfer"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className="rounded-xl"
              />
            </div>

            <div className="pt-4 flex items-center justify-end gap-3 border-t border-border/60">
              <Button type="button" variant="outline" onClick={handleCancel} className="rounded-xl">
                Cancel
              </Button>
              <Button type="submit" disabled={isRecording} className="rounded-xl gap-2 font-bold bg-[#0055FF] text-white hover:bg-[#0055FF]/90">
                <Check className="h-4 w-4" />
                {isRecording ? "Recording..." : "Confirm Settlement"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

export default SettlementNewPage;
