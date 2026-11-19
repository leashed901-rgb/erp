import AdminShell from '@/components/platform-admin/AdminShell';

export const metadata = { title: 'unleashe — Platform Admin' };

export default function PlatformAdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}
