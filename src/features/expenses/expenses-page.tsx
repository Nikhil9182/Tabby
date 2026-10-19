import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Plus, Receipt, Search, Filter, Calendar } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/layout/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useExpenses } from "@/hooks/use-expenses";

export function ExpensesPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const { expenses, isLoading } = useExpenses();

  const filteredExpenses = (expenses || []).filter((exp) =>
    exp.description.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6 animate-in fade-in-50 duration-300">
      <PageHeader
        title="Expenses"
        description="Review all recorded expenses across personal and group ledgers."
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Expenses" },
        ]}
        action={
          <Button asChild size="sm" className="gap-1.5 shadow-xs">
            <Link to="/expenses/new">
              <Plus className="h-4 w-4" /> Add Expense
            </Link>
          </Button>
        }
      />

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-2 rounded-2xl border border-border bg-card/60">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search expenses by description..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-10 border-0 bg-transparent focus-visible:ring-0 shadow-none text-sm"
          />
        </div>
      </div>

      {/* Expense List or Empty State */}
      {filteredExpenses.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title={search ? "No matching expenses" : "No expenses recorded yet"}
          description={
            search
              ? `No expenses matched "${search}". Try searching for something else.`
              : "Record your first shared expense to start tracking splits."
          }
          action={
            search
              ? { label: "Clear search", onClick: () => setSearch("") }
              : { label: "Add Expense", onClick: () => navigate("/expenses/new") }
          }
        />
      ) : (
        <div className="space-y-3">
          {filteredExpenses.map((expense) => {
            const amountFormatted = (
              (expense.originalAmountMinor || 0) / 100
            ).toFixed(2);

            return (
              <Link
                key={expense.id}
                to={`/expenses/${expense.id}`}
                className="flex items-center justify-between p-4 rounded-2xl border border-border/80 bg-card hover:border-primary/40 hover:bg-accent/30 transition-all group"
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="h-11 w-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                    <Receipt className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-foreground truncate group-hover:text-primary transition-colors">
                      {expense.description}
                    </h3>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {new Date(expense.expenseDate).toLocaleDateString()}
                      </span>
                      <span>&bull;</span>
                      <span>{expense.participants.length} participants</span>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col items-end shrink-0 pl-3">
                  <span className="text-sm font-bold text-foreground">
                    ${amountFormatted} {expense.originalCurrency || "USD"}
                  </span>
                  <Badge variant="outline" className="text-[10px] mt-1 capitalize">
                    {expense.splitType || "Equal"}
                  </Badge>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default ExpensesPage;
