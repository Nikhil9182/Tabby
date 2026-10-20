import { useState, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Plus,
  Receipt,
  Search,
  Calendar,
  Edit2,
  Utensils,
  ShoppingCart,
  Car,
  Home,
  Plane,
  Coffee,
  Users,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/layout/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useExpenses } from "@/hooks/use-expenses";
import { useGroups } from "@/hooks/use-groups";
import { formatMoney } from "@/domain/money/money";
import { cn } from "@/lib/utils";

export function ExpensesPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const { expenses, isLoading } = useExpenses();
  const { groups } = useGroups();

  const groupMap = useMemo(() => {
    const map = new Map<string, string>();
    (groups || []).forEach((g) => map.set(g.id, g.name));
    return map;
  }, [groups]);

  const activeExpenses = useMemo(() => {
    return (expenses || []).filter((e) => !e.deletedAt);
  }, [expenses]);

  const filteredExpenses = useMemo(() => {
    if (!search.trim()) return activeExpenses;
    const q = search.toLowerCase();
    return activeExpenses.filter(
      (exp) =>
        exp.description.toLowerCase().includes(q) ||
        (exp.notes && exp.notes.toLowerCase().includes(q))
    );
  }, [activeExpenses, search]);

  const getExpenseIconInfo = (description: string) => {
    const descLower = description.toLowerCase();
    if (
      descLower.includes("grocer") ||
      descLower.includes("suppl") ||
      descLower.includes("market")
    ) {
      return {
        icon: ShoppingCart,
        bg: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border dark:border-emerald-800/40",
      };
    }
    if (
      descLower.includes("taxi") ||
      descLower.includes("airport") ||
      descLower.includes("cab") ||
      descLower.includes("uber") ||
      descLower.includes("toll") ||
      descLower.includes("car")
    ) {
      return {
        icon: Car,
        bg: "bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300 dark:border dark:border-blue-800/40",
      };
    }
    if (
      descLower.includes("rent") ||
      descLower.includes("hotel") ||
      descLower.includes("stay") ||
      descLower.includes("house")
    ) {
      return {
        icon: Home,
        bg: "bg-indigo-100 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300 dark:border dark:border-indigo-800/40",
      };
    }
    if (
      descLower.includes("flight") ||
      descLower.includes("plane") ||
      descLower.includes("trip")
    ) {
      return {
        icon: Plane,
        bg: "bg-cyan-100 text-cyan-700 dark:bg-cyan-950/50 dark:text-cyan-300 dark:border dark:border-cyan-800/40",
      };
    }
    if (
      descLower.includes("coffee") ||
      descLower.includes("tea") ||
      descLower.includes("cafe")
    ) {
      return {
        icon: Coffee,
        bg: "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300 dark:border dark:border-amber-800/40",
      };
    }
    if (
      descLower.includes("dinner") ||
      descLower.includes("lunch") ||
      descLower.includes("food") ||
      descLower.includes("restaurant")
    ) {
      return {
        icon: Utensils,
        bg: "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300 dark:border dark:border-amber-800/40",
      };
    }
    return {
      icon: Receipt,
      bg: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:border dark:border-slate-700/40",
    };
  };

  return (
    <div className="space-y-6 sm:space-y-8 animate-in fade-in-50 duration-300 pb-16">
      <PageHeader
        title="Expenses"
        description="Review all recorded expenses across personal and group ledgers."
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Expenses" },
        ]}
        action={
          <Button
            asChild
            className="h-11 px-5 rounded-2xl bg-[#0055FF] hover:bg-[#0055FF]/90 text-white font-bold gap-2 shadow-sm transition-transform active:scale-98"
          >
            <Link to="/expenses/new">
              <Plus className="h-4 w-4 stroke-[2.5]" /> Add Expense
            </Link>
          </Button>
        }
      />

      {/* Filter and Search Bar */}
      <div className="relative max-w-md">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search expenses by description..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10 h-11 rounded-2xl bg-card border-border/80 focus-visible:ring-1 focus-visible:ring-primary shadow-2xs text-sm font-medium"
        />
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
            const { icon: Icon, bg: iconBg } = getExpenseIconInfo(expense.description);
            const groupName = expense.groupId ? groupMap.get(expense.groupId) : null;
            const amountFormatted = formatMoney(
              expense.originalAmountMinor,
              expense.originalCurrency || "USD"
            );

            return (
              <Link
                key={expense.id}
                to={`/expenses/${expense.id}`}
                className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-4 sm:p-5 rounded-3xl border border-border/80 bg-card hover:border-[#0055FF]/40 hover:shadow-xs transition-all group"
              >
                <div className="flex flex-1 items-center gap-3.5 min-w-0">
                  <div
                    className={cn(
                      "h-11 w-11 rounded-2xl flex items-center justify-center shrink-0 transition-transform group-hover:scale-105 shadow-2xs",
                      iconBg
                    )}
                  >
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-base font-bold text-foreground truncate group-hover:text-[#0055FF] transition-colors">
                      {expense.description}
                    </h3>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5 flex-wrap">
                      <span className="flex items-center gap-1 font-medium">
                        <Calendar className="h-3 w-3" />
                        {new Date(expense.expenseDate).toLocaleDateString()}
                      </span>
                      <span>&bull;</span>
                      <span className="flex items-center gap-1 font-medium">
                        <Users className="h-3 w-3" />
                        {expense.participants?.length || 1} participant{expense.participants?.length === 1 ? "" : "s"}
                      </span>
                      {groupName && (
                        <>
                          <span>&bull;</span>
                          <span className="font-semibold text-foreground/80">{groupName}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 sm:pl-3 border-t sm:border-0 pt-3 sm:pt-0">
                  <div className="flex flex-col items-end">
                    <span className="text-base font-black text-foreground">
                      {amountFormatted}
                    </span>
                    <Badge variant="outline" className="text-[10px] mt-1 capitalize font-bold">
                      {expense.splitType || "Equal"}
                    </Badge>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted opacity-80 sm:opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Edit expense"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      navigate(`/expenses/${expense.id}/edit`);
                    }}
                  >
                    <Edit2 className="h-4 w-4" />
                  </Button>
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
