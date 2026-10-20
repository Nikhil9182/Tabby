import React, { useState, useMemo } from 'react';
import {
  Download,
  Calendar,
  PieChart as PieIcon,
  BarChart3,
  TrendingUp,
  Tag,
  Receipt,
  Layers,
  Info,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  PieChart,
  Pie,
  Cell,
  Legend,
  CartesianGrid,
} from 'recharts';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/layout/empty-state';
import { CurrencyDisplay } from '@/components/currency/currency-display';
import { CurrencySelector } from '@/components/currency/currency-selector';
import {
  useExpenses,
  useCurrentUser,
  useCategories,
  useGroups,
  useCurrency,
  useUsers,
} from '@/hooks';
import { formatMoney, toMajorUnits } from '@/domain/money/money';
import { formatDate } from '@/lib/date';
import type { Expense } from '@/domain/models/types';

const CHART_COLORS = [
  '#3b82f6', // blue
  '#10b981', // emerald
  '#f59e0b', // amber
  '#8b5cf6', // purple
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#ef4444', // red
  '#64748b', // slate
];

export function ReportsPage() {
  const { user } = useCurrentUser();
  const currentUserId = user?.id || 'current_user';

  const { defaultCurrency, setDefaultCurrency } = useCurrency();
  const [reportingCurrency, setReportingCurrency] = useState(defaultCurrency);
  const [period, setPeriod] = useState<'this-month' | 'last-month' | 'last-3-months' | 'all-time'>('this-month');

  const { expenses, splits, isLoading } = useExpenses();
  const { categories } = useCategories();
  const { groups } = useGroups();
  const { users } = useUsers();

  const categoryMap = useMemo(() => {
    const map = new Map<string, string>();
    categories.forEach((c) => map.set(c.id, c.name));
    return map;
  }, [categories]);

  const groupMap = useMemo(() => {
    const map = new Map<string, string>();
    groups.forEach((g) => map.set(g.id, g.name));
    return map;
  }, [groups]);

  // Filter expenses by period
  const filteredExpenses = useMemo(() => {
    const now = new Date();
    const active = expenses.filter((e) => !e.deletedAt);

    if (period === 'this-month') {
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      return active.filter((e) => new Date(e.expenseDate) >= startOfMonth);
    }

    if (period === 'last-month') {
      const startOfLast = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const endOfLast = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
      return active.filter((e) => {
        const d = new Date(e.expenseDate);
        return d >= startOfLast && d <= endOfLast;
      });
    }

    if (period === 'last-3-months') {
      const startOf3m = new Date(now.getTime() - 90 * 24 * 3600 * 1000);
      return active.filter((e) => new Date(e.expenseDate) >= startOf3m);
    }

    return active;
  }, [expenses, period]);

  // Calculations for Summary Cards
  const summaryStats = useMemo(() => {
    let totalMinor = 0;
    const catTotals: Record<string, number> = {};
    let personalMinor = 0;
    let groupMinor = 0;

    filteredExpenses.forEach((e) => {
      // For personal share: check if split exists
      const expSplits = splits[e.id] || [];
      const userSplit = expSplits.find((s) => s.userId === currentUserId);
      const userShare = userSplit ? userSplit.shareMinor : e.originalAmountMinor;

      totalMinor += userShare;

      const catName = (e.categoryId && categoryMap.get(e.categoryId)) || 'Uncategorized';
      catTotals[catName] = (catTotals[catName] || 0) + userShare;

      if (e.sourceType === 'personal' || !e.groupId) {
        personalMinor += userShare;
      } else {
        groupMinor += userShare;
      }
    });

    const expenseCount = filteredExpenses.length;
    const avgMinor = expenseCount > 0 ? Math.round(totalMinor / expenseCount) : 0;

    let topCategory = 'None';
    let topCategoryAmount = 0;
    Object.entries(catTotals).forEach(([cat, amt]) => {
      if (amt > topCategoryAmount) {
        topCategoryAmount = amt;
        topCategory = cat;
      }
    });

    return {
      totalMinor,
      avgMinor,
      expenseCount,
      topCategory,
      personalMinor,
      groupMinor,
      catTotals,
    };
  }, [filteredExpenses, splits, currentUserId, categoryMap]);

  // Category Pie Chart Data
  const categoryChartData = useMemo(() => {
    return Object.entries(summaryStats.catTotals).map(([name, minor]) => ({
      name,
      value: toMajorUnits(minor, reportingCurrency),
    }));
  }, [summaryStats.catTotals, reportingCurrency]);

  // Monthly Spending Bar Chart Data (last 6 months)
  const monthlyChartData = useMemo(() => {
    const monthsMap: Record<string, number> = {};
    const now = new Date();

    // Prepare 6 month keys
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = formatDate(d, 'MMM yyyy');
      monthsMap[key] = 0;
    }

    expenses.forEach((e) => {
      if (e.deletedAt) return;
      const key = formatDate(e.expenseDate, 'MMM yyyy');
      if (monthsMap[key] !== undefined) {
        const expSplits = splits[e.id] || [];
        const userSplit = expSplits.find((s) => s.userId === currentUserId);
        const userShare = userSplit ? userSplit.shareMinor : e.originalAmountMinor;
        monthsMap[key] += toMajorUnits(userShare, reportingCurrency);
      }
    });

    return Object.entries(monthsMap).map(([month, amount]) => ({
      month,
      amount,
    }));
  }, [expenses, splits, currentUserId, reportingCurrency]);

  // Personal vs Group Breakdown Data
  const typeChartData = useMemo(() => {
    return [
      { name: 'Personal Expenses', value: toMajorUnits(summaryStats.personalMinor, reportingCurrency) },
      { name: 'Group Splits', value: toMajorUnits(summaryStats.groupMinor, reportingCurrency) },
    ].filter((item) => item.value > 0);
  }, [summaryStats, reportingCurrency]);

  // CSV Export
  const handleExportCSV = () => {
    const headers = [
      'Date',
      'Description',
      'Category',
      'Group',
      'Payer',
      'Total Amount',
      'Currency',
      'Your Share',
      'Notes',
    ];

    const rows = filteredExpenses.map((e) => {
      const cat = e.categoryId ? categoryMap.get(e.categoryId) || '' : '';
      const groupName = e.groupId ? groupMap.get(e.groupId) || '' : 'Personal';
      const payer = users.find((u) => u.id === e.paidBy);
      const payerName = payer?.name || e.paidBy;
      const expSplits = splits[e.id] || [];
      const userSplit = expSplits.find((s) => s.userId === currentUserId);
      const yourShare = userSplit
        ? toMajorUnits(userSplit.shareMinor, e.originalCurrency)
        : toMajorUnits(e.originalAmountMinor, e.originalCurrency);

      return [
        `"${formatDate(e.expenseDate)}"`,
        `"${e.description.replace(/"/g, '""')}"`,
        `"${cat}"`,
        `"${groupName}"`,
        `"${payerName}"`,
        toMajorUnits(e.originalAmountMinor, e.originalCurrency),
        e.originalCurrency,
        yourShare,
        `"${(e.notes || '').replace(/"/g, '""')}"`,
      ].join(',');
    });

    const csvContent = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `tabby-report-${period}-${formatDate(new Date())}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-8 pb-16">
      <PageHeader
        title="Reports & Analytics"
        description="Visualize spending habits, category breakdowns, and export ledger records."
        actions={
          <Button
            onClick={handleExportCSV}
            disabled={filteredExpenses.length === 0}
            className="h-11 px-5 rounded-2xl bg-[#0055FF] hover:bg-[#0055FF]/90 text-white font-bold gap-2 shadow-sm transition-transform active:scale-98"
          >
            <Download className="h-4 w-4 stroke-[2.5]" />
            <span>Export CSV</span>
          </Button>
        }
      />

      {/* Control Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-card p-3 sm:p-4 rounded-3xl border border-border/80 shadow-2xs">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground ml-1" />
          <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Period
          </span>
          <Select value={period} onValueChange={(val: any) => setPeriod(val)}>
            <SelectTrigger className="w-44 h-10 rounded-2xl bg-muted/30 border-0 text-xs font-semibold">
              <SelectValue placeholder="Period" />
            </SelectTrigger>
            <SelectContent className="rounded-2xl">
              <SelectItem value="this-month">This Month</SelectItem>
              <SelectItem value="last-month">Last Month</SelectItem>
              <SelectItem value="last-3-months">Last 3 Months</SelectItem>
              <SelectItem value="all-time">All Time</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Currency
          </span>
          <div className="w-48">
            <CurrencySelector
              value={reportingCurrency}
              onChange={setReportingCurrency}
            />
          </div>
        </div>
      </div>

      {/* 4 Summary Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-3xl border border-border/80 bg-card p-5 sm:p-6 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between pb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Total Spent
            </span>
            <TrendingUp className="h-4 w-4 text-primary" />
          </div>
          <div className="pt-2">
            <CurrencyDisplay
              amountMinor={summaryStats.totalMinor}
              currency={reportingCurrency}
              size="lg"
              className="text-foreground font-black text-2xl sm:text-3xl"
            />
            <p className="text-xs text-muted-foreground font-medium mt-1">Your personal share</p>
          </div>
        </div>

        <div className="rounded-3xl border border-border/80 bg-card p-5 sm:p-6 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between pb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Average Per Expense
            </span>
            <Receipt className="h-4 w-4 text-primary" />
          </div>
          <div className="pt-2">
            <CurrencyDisplay
              amountMinor={summaryStats.avgMinor}
              currency={reportingCurrency}
              size="lg"
              className="text-foreground font-black text-2xl sm:text-3xl"
            />
            <p className="text-xs text-muted-foreground font-medium mt-1">Mean transaction size</p>
          </div>
        </div>

        <div className="rounded-3xl border border-border/80 bg-card p-5 sm:p-6 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between pb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Top Category
            </span>
            <Tag className="h-4 w-4 text-primary" />
          </div>
          <div className="pt-2">
            <h3 className="text-2xl sm:text-3xl font-black text-foreground truncate">
              {summaryStats.topCategory}
            </h3>
            <p className="text-xs text-muted-foreground font-medium mt-1">Largest expenditure</p>
          </div>
        </div>

        <div className="rounded-3xl border border-border/80 bg-card p-5 sm:p-6 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between pb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Total Expenses
            </span>
            <Layers className="h-4 w-4 text-primary" />
          </div>
          <div className="pt-2">
            <h3 className="text-2xl sm:text-3xl font-black text-foreground">
              {summaryStats.expenseCount}
            </h3>
            <p className="text-xs text-muted-foreground font-medium mt-1">Transactions in period</p>
          </div>
        </div>
      </div>

      {/* Main Charts */}
      {filteredExpenses.length === 0 ? (
        <EmptyState
          icon={<BarChart3 className="h-6 w-6" />}
          title="No data for this time period"
          description="Try selecting a broader date range or record expenses to view analytics."
        />
      ) : (
        <div className="space-y-6">
          {/* Monthly Trend Bar Chart */}
          <Card className="border-border/60 shadow-xs">
            <CardHeader className="p-6 pb-2">
              <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-primary" />
                <span>Monthly Spending Trend (Last 6 Months)</span>
              </CardTitle>
              <CardDescription>
                Your personal spending share over time ({reportingCurrency}).
              </CardDescription>
            </CardHeader>
            <CardContent className="p-6 pt-4 h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyChartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <RechartsTooltip
                    formatter={(val: any) => [`${formatMoney(toMajorUnits(val * 100, reportingCurrency), reportingCurrency)}`, 'Spent']}
                  />
                  <Bar dataKey="amount" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* 2-Column Pie Charts: Category Breakdown & Personal vs Group */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Category Breakdown */}
            <Card className="border-border/60 shadow-xs">
              <CardHeader className="p-6 pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <PieIcon className="h-4 w-4 text-primary" />
                  <span>Category Breakdown</span>
                </CardTitle>
                <CardDescription>
                  Distribution of expenditures across categories.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-6 pt-4 h-72">
                {categoryChartData.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center pt-24">No category data</p>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={categoryChartData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={80}
                        paddingAngle={3}
                      >
                        {categoryChartData.map((_, index) => (
                          <Cell
                            key={`cell-${index}`}
                            fill={CHART_COLORS[index % CHART_COLORS.length]}
                          />
                        ))}
                      </Pie>
                      <RechartsTooltip
                        formatter={(val: any) => [`${formatMoney(toMajorUnits(val * 100, reportingCurrency), reportingCurrency)}`, 'Amount']}
                      />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            {/* Personal vs Group Spending */}
            <Card className="border-border/60 shadow-xs">
              <CardHeader className="p-6 pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Layers className="h-4 w-4 text-primary" />
                  <span>Personal vs. Group Splits</span>
                </CardTitle>
                <CardDescription>
                  Comparison between solo expenses and group shared tabs.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-6 pt-4 h-72">
                {typeChartData.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center pt-24">No split data</p>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={typeChartData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={80}
                        paddingAngle={3}
                      >
                        <Cell fill="#10b981" />
                        <Cell fill="#8b5cf6" />
                      </Pie>
                      <RechartsTooltip
                        formatter={(val: any) => [`${formatMoney(toMajorUnits(val * 100, reportingCurrency), reportingCurrency)}`, 'Amount']}
                      />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Exchange rates note */}
          <div className="p-4 rounded-xl border border-border/40 bg-muted/20 text-xs text-muted-foreground flex items-center gap-2">
            <Info className="h-4 w-4 text-primary shrink-0" />
            <span>
              All transactions are calculated using integer minor units. Multi-currency conversions
              utilize daily cached European Central Bank / Frankfurt exchange rates.
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

export default ReportsPage;
