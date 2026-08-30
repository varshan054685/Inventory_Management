import React, { useMemo, useState } from 'react';
import { api } from '@/api/client';
import { useData } from '@/hooks/useData';
import { StatCard, Card, Spinner, EmptyState, StatusBadge } from '@/components/ui';
import { currency, number, monthLabel, todayIso, currentMonth } from '@/utils/format';
import {
  ShoppingCart,
  Factory,
  PackageCheck,
  Boxes,
  Package,
  Users,
  UserX,
  Timer,
  Wallet,
  AlertTriangle,
  Activity,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
  LineChart,
  Line,
} from 'recharts';

export function DashboardPage() {
  const { data: stats, loading } = useData(() => api.dashboard.stats(), []);
  const fromDate = useMemo(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 5);
    d.setDate(1);
    return d.toISOString().slice(0, 10);
  }, []);
  const toDate = todayIso();
  const { data: series } = useData(() => api.dashboard.series(fromDate, toDate), [fromDate, toDate]);

  const recentMonths = useMemo(() => {
    const months: string[] = [];
    const d = new Date(fromDate);
    while (d.toISOString().slice(0, 10) <= toDate) {
      months.push(d.toISOString().slice(0, 7));
      d.setMonth(d.getMonth() + 1);
    }
    return months;
  }, [fromDate, toDate]);

  const chart = useMemo(() => {
    if (!series) return { purchases: [], production: [], dispatches: [] };
    const pmap = new Map(series.purchases.map((r) => [r.month, r]));
    const prmap = new Map(series.production.map((r) => [r.month, r]));
    const dmap = new Map(series.dispatches.map((r) => [r.month, r]));
    const purchases = recentMonths.map((m) => ({ month: m, value: pmap.get(m)?.total ?? 0 }));
    const production = recentMonths.map((m) => ({
      month: m,
      units: prmap.get(m)?.units ?? 0,
      cost: prmap.get(m)?.cost ?? 0,
    }));
    const dispatches = recentMonths.map((m) => ({ month: m, value: dmap.get(m)?.quantity ?? 0 }));
    return { purchases, production, dispatches };
  }, [series, recentMonths]);

  if (loading && !stats) {
    return (
      <div className="h-64 flex items-center justify-center">
        <Spinner />
      </div>
    );
  }
  if (!stats) return <EmptyState message="Unable to load dashboard" />;

  const lowStock = stats.lowStock;
  const month = currentMonth();

  return (
    <div className="space-y-6">
      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Today's Purchases" icon={<ShoppingCart className="w-5 h-5" />} value={currency(stats.todayPurchasesAmount)} />
        <StatCard label="Today's Production" icon={<Factory className="w-5 h-5" />} value={number(stats.todayProductionUnits)} />
        <StatCard label="Today's Dispatch" icon={<PackageCheck className="w-5 h-5" />} value={number(stats.todayDispatchQuantity)} />
        <StatCard label="Staff Present Today" icon={<Users className="w-5 h-5" />} value={`${stats.staffPresent}`} />
        <StatCard label="Staff Absent Today" icon={<UserX className="w-5 h-5" />} value={`${stats.staffAbsent}`} />
        <StatCard label="Today's Overtime" icon={<Timer className="w-5 h-5" />} value={`${number(stats.todayOvertimeHours, 1)} hrs`} />
        <StatCard label={`${monthLabel(month)} Wages`} icon={<Wallet className="w-5 h-5" />} value={currency(stats.monthWages)} />
        <StatCard
          label="Raw Material Items"
          icon={<Boxes className="w-5 h-5" />}
          value={`${stats.rawMaterialItems}`}
          accent="bg-sky-50 text-sky-600 dark:bg-sky-900/30 dark:text-sky-300"
        />
      </div>

      {/* Low stock alert */}
      {lowStock.length > 0 && (
        <Card className="border-amber-300 dark:border-amber-700">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
            <h3 className="card-title">Low Stock Alerts</h3>
            <span className="badge badge-warning">{lowStock.length}</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {lowStock.map((l) => (
              <div
                key={`${l.itemType}-${l.itemId}`}
                className="rounded-md border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/10 p-3"
              >
                <div className="font-medium text-slate-800 dark:text-white text-sm">{l.name}</div>
                <div className="mt-1 flex items-center justify-between">
                  <span className="text-xs text-slate-500">
                    <span className="badge badge-danger">
                      {number(l.closing)} {l.unit}
                    </span>
                  </span>
                  <span className="text-xs text-slate-400">min {l.minStock}</span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card>
          <h3 className="card-title mb-3 flex items-center gap-2">
            <Activity className="w-4 h-4 text-brand-500" /> Purchase Summary
          </h3>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chart.purchases}>
                <CartesianGrid strokeDasharray="3 3" stroke="#94a3b8" strokeOpacity={0.2} />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Bar dataKey="value" name="₹" fill="#e14c66" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card>
          <h3 className="card-title mb-3 flex items-center gap-2">
            <Factory className="w-4 h-4 text-brand-500" /> Production Summary
          </h3>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chart.production}>
                <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.2} />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="units" name="Units" stroke="#e14c66" />
                <Line type="monotone" dataKey="cost" name="Cost" stroke="#0ea5e9" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card>
          <h3 className="card-title mb-3 flex items-center gap-2">
            <PackageCheck className="w-4 h-4 text-brand-500" /> Dispatch Summary
          </h3>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chart.dispatches}>
                <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.2} />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Bar dataKey="value" name="Qty" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>
    </div>
  );
}