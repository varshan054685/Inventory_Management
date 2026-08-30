import {
  LayoutDashboard,
  Package,
  Boxes,
  Truck,
  ShoppingCart,
  Factory,
  BookOpen,
  Warehouse,
  Users,
  CalendarDays,
  Wallet,
  Timer,
  PackageCheck,
  FileBarChart2,
  DatabaseBackup,
  Settings as SettingsIcon,
} from 'lucide-react';

export interface NavItem {
  path: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

export const NAV_ITEMS: NavItem[] = [
  { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/products', label: 'Products', icon: Package },
  { path: '/raw-materials', label: 'Raw Materials', icon: Boxes },
  { path: '/suppliers', label: 'Suppliers', icon: Truck },
  { path: '/purchases', label: 'Purchase', icon: ShoppingCart },
  { path: '/production', label: 'Production', icon: Factory },
  { path: '/recipes', label: 'Recipes', icon: BookOpen },
  { path: '/stock', label: 'Stock', icon: Warehouse },
  { path: '/staff', label: 'Staff', icon: Users },
  { path: '/attendance', label: 'Attendance', icon: CalendarDays },
  { path: '/wages', label: 'Wages', icon: Wallet },
  { path: '/overtime', label: 'Overtime', icon: Timer },
  { path: '/dispatch', label: 'Dispatch', icon: PackageCheck },
  { path: '/reports', label: 'Reports', icon: FileBarChart2 },
  { path: '/backup', label: 'Backup & Restore', icon: DatabaseBackup },
  { path: '/settings', label: 'Settings', icon: SettingsIcon },
];