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
import { SettleUpFields } from "@/components/settlements/settle-up-fields";
import { useSettlements } from "@/hooks/use-settlements";
import { useExpenses } from "@/hooks/use-expenses";
import { useUsers, useCurrentUser } from "@/hooks/use-users";
import { useAuth } from "@/hooks/use-auth";
import { useCurrency } from "@/hooks/use-currency";
import { useSettleUp } from "@/hooks/use-settle-up";
import { calculateGroupBalances, calculatePairwiseBalanceBag } from "@/domain/balances/balance-engine";
import { addToBag, bagSide, EMPTY_BAG, type MoneyBag } from "@/domain/money/conversion";
import type { ExpenseSplit } from "@/domain/models/types";

export function SettlementNewPage() {
  const navigate = useNavigate();
  const { recordSettlement, isRecording, settlements } = useSettlements();
  const { expenses, splits } = useExpenses();
  const { groups } = useGroups();
  const { users } = useUsers();
  const { user: currentUser } = useCurrentUser();
  const { user } = useAuth();
  const { defaultCurrency } = useCurrency();
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
  const paramAmountMinor = parseInt(searchParams.get("amountMinor") || searchParams.get("amount") || "", 10);
  const paramCurrency = searchParams.get("currency") || undefined;
  const returnTo = searchParams.get("returnTo");

  const [fromUser, setFromUser] = useState(paramFromUser || currentId);
  const [toUser, setToUser] = useState(paramToUser || "");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const payerId = fromUser || currentId;
  const allSplits = useMemo(() => Object.values(splits).flat() as ExpenseSplit[], [splits]);

  // What the payer owes the recipient in this context, per currency
  const debtBag: MoneyBag = useMemo(() => {
    if (!payerId || !toUser || payerId === toUser) return EMPTY_BAG;

    if (groupId) {
      const group = groups.find((g) => g.id === groupId);
      const gb = calculateGroupBalances(
        groupId,
        expenses.filter((e) => e.groupId === groupId),
        allSplits,
        settlements.filter((s) => s.groupId === groupId),
        group?.currency || defaultCurrency
      );
      // Suggested (simplified) payments may route around pairwise debts
      let bag: MoneyBag = EMPTY_BAG;
      for (const d of gb.simplifiedDebts) {
        if (d.fromUserId === payerId && d.toUserId === toUser) bag = addToBag(bag, d.currency, d.amountMinor);
      }
      return bag;
    }

    const direct = (contextType?: string, gid?: string) => contextType === "direct" || !gid;
    return bagSide(
      calculatePairwiseBalanceBag(
        payerId,
        toUser,
        expenses.filter((e) => direct(e.contextType, e.groupId)),
        allSplits,
        settlements.filter((s) => direct(s.contextType, s.groupId))
      ),
      "positive"
    );
  }, [payerId, toUser, groupId, groups, expenses, allSplits, settlements, defaultCurrency]);

  // Re-key the amount fields when the pair changes so stale amounts don't carry over
  const pairKey = `${payerId}->${toUser}`;

  const payerName = useMemo(() => {
    if (payerId === currentId) return currentUser?.name || "You";
    const found = users.find((u) => u.id === payerId);
    return found?.name || found?.email || "Payer";
  }, [payerId, currentId, currentUser, users]);

  const recipientName = useMemo(() => {
    if (!toUser) return "Select recipient";
    if (toUser === currentId) return currentUser?.name || "You";
    const found = users.find((u) => u.id === toUser);
    return found?.name || found?.email || "Recipient";
  }, [toUser, currentId, currentUser, users]);

  const leave = () => {
    if (returnTo) {
      navigate(returnTo);
    } else if (groupId) {
      navigate(`/groups/${groupId}?tab=balances`);
    } else if (toUser && toUser !== currentId) {
      navigate(`/friends?friendId=${toUser}`);
    } else if (payerId !== currentId) {
      navigate(`/friends?friendId=${payerId}`);
    } else {
      navigate("/settlements");
    }
  };

  return (
    <div className="max-w-xl mx-auto space-y-6 animate-in fade-in-50 duration-300">
      <PageHeader
        title="Settle Up"
        description="Record money you paid someone, or that someone paid you."
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Settlements", href: "/settlements" },
          { label: "Record" },
        ]}
      />

      <Card className="rounded-3xl border-border bg-card shadow-xs">
        <CardHeader className="pb-4">
          <CardTitle className="text-base font-bold">Payment details</CardTitle>
          <CardDescription>
            This reduces what's owed. It doesn't add a new expense.
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

            <ArrowRight className="h-4 w-4 text-primary stroke-[2.5] shrink-0" />

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

          <div className="space-y-4">
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

            <SettlementAmountForm
              key={pairKey}
              debtBag={debtBag}
              fallbackCurrency={paramCurrency || defaultCurrency}
              initialCurrency={pairKey === `${paramFromUser}->${paramToUser}` ? paramCurrency : undefined}
              initialAmountMinor={
                pairKey === `${paramFromUser}->${paramToUser}` && paramAmountMinor > 0 ? paramAmountMinor : undefined
              }
              date={date}
              setDate={setDate}
              notes={notes}
              setNotes={setNotes}
              isRecording={isRecording}
              onCancel={leave}
              onSubmit={async (submission) => {
                setFormError(null);
                if (!toUser.trim()) {
                  setFormError("Recipient user is required");
                  return;
                }
                if (payerId === toUser) {
                  setFormError("Payer and recipient cannot be the same user");
                  return;
                }
                try {
                  const isDirect = !groupId;
                  const otherUserId = payerId === currentId ? toUser.trim() : payerId;
                  await recordSettlement({
                    groupId: isDirect ? undefined : groupId,
                    friendId: isDirect ? otherUserId : undefined,
                    contextType: isDirect ? "direct" : "group",
                    fromUserId: payerId,
                    toUserId: toUser.trim(),
                    amountMinor: submission.amountMinor,
                    currency: submission.currency,
                    conversion: submission.conversion,
                    settlementDate: new Date(date).toISOString(),
                    notes: notes.trim() || undefined,
                    createdBy: currentId,
                  });
                  leave();
                } catch (err: unknown) {
                  setFormError(err instanceof Error ? err.message : "Failed to record settlement");
                }
              }}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

interface SettlementAmountFormProps {
  debtBag: MoneyBag;
  fallbackCurrency: string;
  initialCurrency?: string;
  initialAmountMinor?: number;
  date: string;
  setDate: (value: string) => void;
  notes: string;
  setNotes: (value: string) => void;
  isRecording: boolean;
  onCancel: () => void;
  onSubmit: (submission: NonNullable<ReturnType<typeof useSettleUp>["submission"]>) => Promise<void>;
}

function SettlementAmountForm({
  debtBag,
  fallbackCurrency,
  initialCurrency,
  initialAmountMinor,
  date,
  setDate,
  notes,
  setNotes,
  isRecording,
  onCancel,
  onSubmit,
}: SettlementAmountFormProps) {
  const settle = useSettleUp({
    debtBag,
    settlementDate: date,
    fallbackCurrency,
    initialCurrency,
    initialAmountMinor,
  });
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!settle.submission) {
      setError(settle.error);
      return;
    }
    await onSubmit(settle.submission);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-destructive/10 text-destructive text-xs border border-destructive/20">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <SettleUpFields state={settle} idPrefix="settlement" />

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
        <Button type="button" variant="outline" onClick={onCancel} className="rounded-xl">
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={isRecording || !settle.submission}
          className="rounded-xl gap-2 font-bold bg-[#0055FF] text-white hover:bg-[#0055FF]/90"
        >
          <Check className="h-4 w-4" />
          {isRecording ? "Recording..." : "Confirm Settlement"}
        </Button>
      </div>
    </form>
  );
}

export default SettlementNewPage;
