
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Reset Password | 12Labs',
  robots: {
    index: false,
    follow: false,
  },
};

export default function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
