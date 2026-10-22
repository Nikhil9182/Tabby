import React, { useState, useMemo, useCallback } from 'react';
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
  useRates,
} from '@/hooks';
import { formatMoney, toMajorUnits, toMinorUnits } from '@/domain/money/money';
import { convertMinor, findQuote } from '@/domain/money/conversion';
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

  // Reports use the one saved display currency; changing it here changes it everywhere
  const { defaultCurrency: reportingCurrency, setDefaultCurrency: setReportingCurrency } = useCurrency();
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

  const reportCurrency = reportingCurrency.toUpperCase();

  // Historical policy: each expense converts at its own date's rate (ARCHITECTURE.md §8.1)
  const today = new Date().toISOString().slice(0, 10);
  const rateDateFor = useCallback(
    (e: Expense) => {
      const day = e.expenseDate.slice(0, 10);
      return day < today ? day : undefined; // today's rate isn't published yet: use latest
    },
    [today]
  );

  /** A stored snapshot is reused when it holds a real rate into the report currency. */
  const usableSnapshot = useCallback(
    (e: Expense) =>
      !!e.exchangeRate &&
      e.reportingCurrency?.toUpperCase() === reportCurrency &&
      e.originalCurrency.toUpperCase() !== reportCurrency &&
      !['identity', 'unavailable'].includes(e.exchangeRateSource || 'identity'),
    [reportCurrency]
  );

  const ratePairs = useMemo(
    () =>
      expenses
        .filter((e) => !e.deletedAt && e.originalCurrency.toUpperCase() !== reportCurrency && !usableSnapshot(e))
        .map((e) => ({ from: e.originalCurrency, to: reportCurrency, date: rateDateFor(e) })),
    [expenses, reportCurrency, usableSnapshot, rateDateFor]
  );
  const { rates, isLoading: isLoadingRates, failures: rateFailures, retry: retryRates } = useRates(ratePairs);

  // Your share of an expense, converted to the report currency. null = no rate available.
  const myShareInReportCurrency = useCallback(
    (e: Expense): number | null => {
      const share =
        e.sourceType === 'personal'
          ? e.originalAmountMinor
          : (splits[e.id] || []).find((s) => s.userId === currentUserId)?.shareMinor ?? 0;
      const currency = (e.originalCurrency || reportCurrency).toUpperCase();
      if (share === 0 || currency === reportCurrency) return share;
      if (usableSnapshot(e)) return convertMinor(share, currency, reportCurrency, e.exchangeRate!);
      const quote = findQuote(rates, currency, reportCurrency, rateDateFor(e));
      if (!quote) return null;
      return convertMinor(share, currency, reportCurrency, quote.rate);
    },
    [splits, currentUserId, reportCurrency, rates, usableSnapshot, rateDateFor]
  );

  // Calculations for Summary Cards
  const summaryStats = useMemo(() => {
    let totalMinor = 0;
    const catTotals: Record<string, number> = {};
    let personalMinor = 0;
    let friendsMinor = 0;
    let groupMinor = 0;
    let expenseCount = 0;
    const unconverted = new Set<string>();

    filteredExpenses.forEach((e) => {
      const userShare = myShareInReportCurrency(e);
      if (userShare === null) {
        unconverted.add(e.originalCurrency.toUpperCase());
        return;
      }
      if (userShare === 0) return; // you're not part of this expense

      expenseCount += 1;
      totalMinor += userShare;

      const catName = (e.categoryId && categoryMap.get(e.categoryId)) || 'Uncategorized';
      catTotals[catName] = (catTotals[catName] || 0) + userShare;

      if (e.sourceType === 'personal') {
        personalMinor += userShare;
      } else if (e.groupId) {
        groupMinor += userShare;
      } else {
        friendsMinor += userShare;
      }
    });

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
      friendsMinor,
      groupMinor,
      catTotals,
      unconverted: [...unconverted],
    };
  }, [filteredExpenses, myShareInReportCurrency, categoryMap]);

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
        monthsMap[key] += myShareInReportCurrency(e) ?? 0;
      }
    });

    // Chart values in major units; tooltips convert back with toMinorUnits
    return Object.entries(monthsMap).map(([month, amountMinor]) => ({
      month,
      amount: toMajorUnits(amountMinor, reportCurrency),
    }));
  }, [expenses, myShareInReportCurrency, reportCurrency]);

  // Personal vs friends vs groups breakdown
  const typeChartData = useMemo(() => {
    return [
      { name: 'Personal', value: toMajorUnits(summaryStats.personalMinor, reportCurrency), color: '#10b981' },
      { name: 'With friends', value: toMajorUnits(summaryStats.friendsMinor, reportCurrency), color: '#3b82f6' },
      { name: 'In groups', value: toMajorUnits(summaryStats.groupMinor, reportCurrency), color: '#8b5cf6' },
    ].filter((item) => item.value > 0);
  }, [summaryStats, reportCurrency]);

  const formatChartValue = (val: unknown) =>
    formatMoney(toMinorUnits(Number(val) || 0, reportCurrency), reportCurrency);

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
      const userSplit = (splits[e.id] || []).find((s) => s.userId === currentUserId);
      const yourShare =
        e.sourceType === 'personal'
          ? toMajorUnits(e.originalAmountMinor, e.originalCurrency)
          : toMajorUnits(userSplit?.shareMinor ?? 0, e.originalCurrency);

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
        description="See where your money goes and download your expenses."
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
            <SelectTrigger className="min-w-0 flex-1 sm:flex-none sm:w-44 h-10 rounded-2xl bg-muted/30 border-0 text-xs font-semibold">
              <SelectValue placeholder="Period" />
            </SelectTrigger>
            <SelectContent>
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
          <div className="min-w-0 flex-1 sm:flex-none sm:w-48">
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
            <p className="text-xs text-muted-foreground font-medium mt-1">Your share of all expenses</p>
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
            <p className="text-xs text-muted-foreground font-medium mt-1">Your share per expense</p>
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
            <p className="text-xs text-muted-foreground font-medium mt-1">Where you spent the most</p>
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
            <p className="text-xs text-muted-foreground font-medium mt-1">Expenses you were part of</p>
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
                Your share of spending each month, in {reportCurrency}.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-6 pt-4 h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyChartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <RechartsTooltip
                    formatter={(val: unknown) => [formatChartValue(val), 'Spent']}
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
                  What you spent on, by category.
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
                        formatter={(val: unknown) => [formatChartValue(val), 'Amount']}
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
                  <span>Personal, Friends & Groups</span>
                </CardTitle>
                <CardDescription>
                  How your spending splits between solo costs, friends and groups.
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
                        {typeChartData.map((item) => (
                          <Cell key={item.name} fill={item.color} />
                        ))}
                      </Pie>
                      <RechartsTooltip
                        formatter={(val: unknown) => [formatChartValue(val), 'Amount']}
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
              Amounts show your share of each expense. Expenses in other currencies are converted
              to {reportCurrency} at the exchange rate on the day of each expense. The original
              amounts are never changed.
              {isLoadingRates && ' Loading exchange rates…'}
              {!isLoadingRates && summaryStats.unconverted.length > 0 && (
                <>
                  {` ${summaryStats.unconverted.join(', ')} expenses are left out because no rate is available. `}
                  {rateFailures.length > 0 && (
                    <button type="button" onClick={retryRates} className="font-semibold text-primary underline">
                      Retry
                    </button>
                  )}
                </>
              )}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

export default ReportsPage;
