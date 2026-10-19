import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Receipt, ArrowLeft, Check, AlertCircle } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useExpenses } from "@/hooks/use-expenses";
import { useUsers, useCurrentUser } from "@/hooks/use-users";
import { useAuth } from "@/hooks/use-auth";

export function ExpenseNewPage() {
  const navigate = useNavigate();
  const { createExpense, isCreating } = useExpenses();
  const { user: currentUser } = useCurrentUser();
  const { user } = useAuth();

  const [description, setDescription] = useState("");
  const [amountStr, setAmountStr] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [splitType, setSplitType] = useState<"equal" | "exact" | "percentage">("equal");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [formError, setFormError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const amountFloat = parseFloat(amountStr);
    if (!description.trim()) {
      setFormError("Please enter a description");
      return;
    }
    if (isNaN(amountFloat) || amountFloat <= 0) {
      setFormError("Please enter a valid amount greater than 0");
      return;
    }

    const amountMinor = Math.round(amountFloat * 100);
    const payerId = currentUser?.id || user?.sub || "user_self";

    try {
      await createExpense({
        description: description.trim(),
        originalAmountMinor: amountMinor,
        amountMinor,
        originalCurrency: currency,
        currency,
        paidBy: payerId,
        participants: [payerId],
        splits: [
          {
            userId: payerId,
            shareMinor: amountMinor,
          },
        ],
        sourceType: "personal",
        sourceId: payerId,
        splitType,
        expenseDate: new Date(date).toISOString(),
      });
      navigate("/expenses");
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : "Failed to save expense");
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-in fade-in-50 duration-300">
      <PageHeader
        title="Add Expense"
        description="Record a new expense and split it across group members or friends."
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Expenses", href: "/expenses" },
          { label: "New" },
        ]}
      />

      <Card className="rounded-2xl border-border bg-card shadow-xs">
        <CardHeader>
          <CardTitle className="text-base font-semibold">Expense Details</CardTitle>
          <CardDescription>
            All amounts are securely stored using exact integer minor units (cents).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            {formError && (
              <div className="flex items-center gap-2 p-3 rounded-xl bg-destructive/10 text-destructive text-xs border border-destructive/20">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="description" className="text-xs font-semibold">
                Description
              </Label>
              <Input
                id="description"
                placeholder="e.g. Dinner with team, Groceries, Utilities"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                required
              />
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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="date" className="text-xs font-semibold">
                  Date
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
                <Label htmlFor="splitType" className="text-xs font-semibold">
                  Split Strategy
                </Label>
                <select
                  id="splitType"
                  value={splitType}
                  onChange={(e) => setSplitType(e.target.value as any)}
                  className="w-full h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="equal">Split Equally</option>
                  <option value="exact">Exact Amounts</option>
                  <option value="percentage">By Percentage</option>
                </select>
              </div>
            </div>

            <div className="pt-4 flex items-center justify-end gap-3 border-t border-border/60">
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate("/expenses")}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isCreating} className="gap-2">
                <Check className="h-4 w-4" />
                {isCreating ? "Saving..." : "Save Expense"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

export default ExpenseNewPage;
