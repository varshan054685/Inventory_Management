import React from 'react';
import { Route, Routes, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/store/auth';
import { Toaster } from '@/components/ui';
import { AppLayout } from '@/components/layout/AppLayout';
import { LoginPage } from '@/features/login/LoginPage';
import { SetupPage } from '@/features/login/SetupPage';
import { LockPage } from '@/features/login/LockPage';

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

function Gate() {
  const { user, needsSetup, loading, locked } = useAuth();

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center text-slate-400">Loading…</div>
    );
  }

  if (needsSetup) {
    return <SetupPage />;
  }

  if (!user) {
    return <LoginPage />;
  }

  if (locked) {
    return <LockPage />;
  }

  return <AppLayout />;
}

function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="*" element={<Gate />} />
      </Routes>
      <Toaster />
    </AuthProvider>
  );
}

export default App;