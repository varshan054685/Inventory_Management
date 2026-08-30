import React from 'react';
import { NavLink, Routes, Route, useLocation, Navigate } from 'react-router-dom';
import { LogOut, Lock, Candy } from 'lucide-react';
import { NAV_ITEMS } from './nav';
import { useAuth } from '@/store/auth';

import { DashboardPage } from '@/features/dashboard/DashboardPage';
import { ProductsPage } from '@/features/products/ProductsPage';
import { RawMaterialsPage } from '@/features/rawMaterials/RawMaterialsPage';
import { SuppliersPage } from '@/features/suppliers/SuppliersPage';
import { PurchasesPage } from '@/features/purchases/PurchasesPage';
import { ProductionPage } from '@/features/production/ProductionPage';
import { RecipesPage } from '@/features/recipes/RecipesPage';
import { StockPage } from '@/features/stock/StockPage';
import { StaffPage } from '@/features/staff/StaffPage';
import { AttendancePage } from '@/features/attendance/AttendancePage';
import { WagesPage } from '@/features/wages/WagesPage';
import { OvertimePage } from '@/features/overtime/OvertimePage';
import { DispatchPage } from '@/features/dispatch/DispatchPage';
import { ReportsPage } from '@/features/reports/ReportsPage';
import { BackupPage } from '@/features/backup/BackupPage';
import { SettingsPage } from '@/features/settings/SettingsPage';

function AppRoutes() {
  return (
    <Routes>
      <Route path="/dashboard" element={<DashboardPage />} />
      <Route path="/products" element={<ProductsPage />} />
      <Route path="/raw-materials" element={<RawMaterialsPage />} />
      <Route path="/suppliers" element={<SuppliersPage />} />
      <Route path="/purchases" element={<PurchasesPage />} />
      <Route path="/production" element={<ProductionPage />} />
      <Route path="/recipes" element={<RecipesPage />} />
      <Route path="/stock" element={<StockPage />} />
      <Route path="/staff" element={<StaffPage />} />
      <Route path="/attendance" element={<AttendancePage />} />
      <Route path="/wages" element={<WagesPage />} />
      <Route path="/overtime" element={<OvertimePage />} />
      <Route path="/dispatch" element={<DispatchPage />} />
      <Route path="/reports" element={<ReportsPage />} />
      <Route path="/backup" element={<BackupPage />} />
      <Route path="/settings" element={<SettingsPage />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

export function AppLayout() {
  const { user, logout, lock } = useAuth();
  const loc = useLocation();
  const current = NAV_ITEMS.find((n) => loc.pathname.startsWith(n.path))?.label ?? 'Dashboard';
  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div className="h-screen flex overflow-hidden">
      {/* Sidebar */}
      <aside className="w-60 flex-shrink-0 bg-slate-900 text-slate-300 flex flex-col hidden md:flex">
        <div className="flex items-center gap-2 px-5 py-5 border-b border-slate-800">
          <div className="rounded-lg bg-brand-600 p-1.5 text-white">
            <Candy className="w-5 h-5" />
          </div>
          <div className="leading-tight">
            <div className="font-bold text-white text-sm">Candy Production</div>
            <div className="text-[11px] text-slate-400">Management System</div>
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
                  isActive
                    ? 'bg-brand-600 text-white'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`
              }
            >
              <item.icon className="w-4 h-4" />
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="px-3 py-3 border-t border-slate-800 text-xs text-slate-500">v1.0.0 • Offline</div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Topbar */}
        <header className="flex items-center justify-between px-6 py-3.5 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
          <h1 className="text-lg font-bold text-slate-800 dark:text-white">{current}</h1>
          <div className="flex items-center gap-4">
            <span className="text-sm text-slate-500 dark:text-slate-400">{today}</span>
            <span className="text-sm text-slate-700 dark:text-slate-200 font-medium">
              {user?.username}
            </span>
            <button onClick={lock} title="Lock application" className="btn-ghost p-1.5 rounded">
              <Lock className="w-4 h-4" />
            </button>
            <button onClick={logout} title="Logout" className="btn-ghost p-1.5 rounded">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto p-6">
          <AppRoutes />
        </main>
      </div>
    </div>
  );
}