import { Link, useNavigate } from "react-router-dom";
import {
  Plus,
  Receipt,
  Users,
  ArrowLeftRight,
  TrendingUp,
  TrendingDown,
  ArrowRight,
  Wallet,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/layout/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useExpenses } from "@/hooks/use-expenses";
import { useGroups } from "@/hooks/use-groups";

export function DashboardPage() {
  const navigate = useNavigate();
  const { expenses, isLoading: expensesLoading } = useExpenses();
  const { groups, isLoading: groupsLoading } = useGroups();

  const recentExpenses = (expenses || []).slice(0, 5);
  const activeGroups = (groups || []).slice(0, 4);

  return (
    <div className="space-y-8 animate-in fade-in-50 duration-300">
      <PageHeader
        title="Dashboard"
        description="Track your balances, shared expenses, and pending group settlements."
        action={
          <div className="flex items-center gap-2">
            <Button asChild size="sm" className="gap-1.5 shadow-xs">
              <Link to="/expenses/new">
                <Plus className="h-4 w-4" /> Add Expense
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm" className="gap-1.5">
              <Link to="/settlements/new">
                <ArrowLeftRight className="h-4 w-4" /> Settle Up
              </Link>
            </Button>
          </div>
        }
      />

      {/* Summary Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="rounded-2xl border-border bg-card/70 shadow-xs">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardDescription className="text-xs font-medium">You are owed</CardDescription>
              <div className="h-8 w-8 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                <TrendingUp className="h-4 w-4" />
              </div>
            </div>
            <CardTitle className="text-2xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400">
              $0.00
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">All friend debts settled</p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-border bg-card/70 shadow-xs">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardDescription className="text-xs font-medium">You owe</CardDescription>
              <div className="h-8 w-8 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                <TrendingDown className="h-4 w-4" />
              </div>
            </div>
            <CardTitle className="text-2xl font-bold tracking-tight text-foreground">
              $0.00
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">No outstanding balances</p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-border bg-card/70 shadow-xs">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardDescription className="text-xs font-medium">Net Balance</CardDescription>
              <div className="h-8 w-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                <Wallet className="h-4 w-4" />
              </div>
            </div>
            <CardTitle className="text-2xl font-bold tracking-tight text-foreground">
              $0.00
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">Balanced across all groups</p>
          </CardContent>
        </Card>
      </div>

      {/* Main Sections: Recent Expenses & Active Groups */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Expenses Section */}
        <div className="p-5 rounded-2xl border border-border bg-card/60 backdrop-blur-xs space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Receipt className="h-4 w-4 text-primary" />
              <h2 className="text-base font-semibold tracking-tight text-foreground">
                Recent Expenses
              </h2>
            </div>
            <Button asChild variant="ghost" size="sm" className="text-xs gap-1">
              <Link to="/expenses">
                View all <ArrowRight className="h-3 w-3" />
              </Link>
            </Button>
          </div>

          {recentExpenses.length === 0 ? (
            <EmptyState
              icon={Receipt}
              title="No expenses yet"
              description="Add your first shared expense to start tracking splits automatically."
              action={{
                label: "Add Expense",
                onClick: () => navigate("/expenses/new"),
              }}
            />
          ) : (
            <div className="space-y-2.5">
              {recentExpenses.map((expense) => (
                <Link
                  key={expense.id}
                  to={`/expenses/${expense.id}`}
                  className="flex items-center justify-between p-3 rounded-xl border border-border/60 bg-card hover:bg-accent/40 transition-colors"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {expense.description}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(expense.expenseDate).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-foreground">
                      {((expense.originalAmountMinor || 0) / 100).toFixed(2)}{" "}
                      {expense.originalCurrency || "USD"}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Active Groups Section */}
        <div className="p-5 rounded-2xl border border-border bg-card/60 backdrop-blur-xs space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" />
              <h2 className="text-base font-semibold tracking-tight text-foreground">
                Active Groups
              </h2>
            </div>
            <Button asChild variant="ghost" size="sm" className="text-xs gap-1">
              <Link to="/groups">
                View all <ArrowRight className="h-3 w-3" />
              </Link>
            </Button>
          </div>

          {activeGroups.length === 0 ? (
            <EmptyState
              icon={Users}
              title="No groups created"
              description="Create a group for an apartment, trip, or project to split shared costs."
              action={{
                label: "Create Group",
                onClick: () => navigate("/groups/new"),
              }}
            />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {activeGroups.map((group) => (
                <Link
                  key={group.id}
                  to={`/groups/${group.id}`}
                  className="p-3.5 rounded-xl border border-border/60 bg-card hover:border-primary/40 hover:bg-accent/30 transition-all flex flex-col justify-between"
                >
                  <div>
                    <h3 className="text-sm font-semibold text-foreground truncate">
                      {group.name}
                    </h3>
                    <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                      {group.description || "Shared group"}
                    </p>
                  </div>
                  <div className="pt-3 mt-2 border-t border-border/40 flex items-center justify-between text-xs text-muted-foreground">
                    <span>{group.currency || "USD"}</span>
                    <Badge variant="secondary" className="text-[10px]">
                      Active
                    </Badge>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default DashboardPage;
