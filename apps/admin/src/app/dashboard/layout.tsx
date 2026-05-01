'use client';

import { AdminLayout } from '../../components/AdminLayout';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AdminLayout showNav={true}>{children}</AdminLayout>;
}
