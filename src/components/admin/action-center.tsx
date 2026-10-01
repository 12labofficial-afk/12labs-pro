'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ChevronRight, CreditCard, MessageCircle, Package, Store, Wallet } from 'lucide-react';
import { getAdminActionItems, type ActionItemGroup } from '@/app/admin/actions';
import { getIdToken } from '@/lib/id-token';
import { reportClientError } from '@/lib/report-client-error';

const META: Record<ActionItemGroup['key'], { label: string; href: string; icon: React.ReactNode; tone: string }> = {
  withdrawals: { label: 'Withdrawal requests', href: '/admin/withdrawals', icon: <Wallet className="h-4 w-4" />, tone: 'text-emerald-600 bg-emerald-500/10' },
  payments: { label: 'Payments not credited', href: '/admin/payments', icon: <CreditCard className="h-4 w-4" />, tone: 'text-red-600 bg-red-500/10' },
  sellerProfiles: { label: 'Seller profiles to approve', href: '/admin/pending', icon: <Store className="h-4 w-4" />, tone: 'text-amber-600 bg-amber-500/10' },
  products: { label: 'Products to approve', href: '/admin/projects', icon: <Package className="h-4 w-4" />, tone: 'text-blue-600 bg-blue-500/10' },
  chats: { label: 'Unanswered support chats', href: '/admin/chat', icon: <MessageCircle className="h-4 w-4" />, tone: 'text-violet-600 bg-violet-500/10' },
};

// Money first, then approvals, then support.
const ORDER: ActionItemGroup['key'][] = ['withdrawals', 'payments', 'sellerProfiles', 'products', 'chats'];
const REFRESH_MS = 60_000;

/**
 * Everything waiting on an admin, pinned to the top of /admin. Renders
 * nothing when there's nothing to do, so it only takes space when needed.
 */
export function ActionCenter() {
  const [groups, setGroups] = useState<ActionItemGroup[]>([]);

  const load = useCallback(async () => {
    try {
      const res = await getAdminActionItems(await getIdToken());
      if (res.success) setGroups(res.groups);
    } catch (e) {
      reportClientError('src/components/admin/action-center.tsx', e);
    }
  }, []);

  useEffect(() => {
    load();
    const id = window.setInterval(load, REFRESH_MS);
    const onFocus = () => load();
    window.addEventListener('focus', onFocus);
    return () => { window.clearInterval(id); window.removeEventListener('focus', onFocus); };
  }, [load]);

  return <ActionCenterView groups={groups} />;
}

export function ActionCenterView({ groups }: { groups: ActionItemGroup[] }) {
  if (groups.length === 0) return null;

  const sorted = [...groups].sort((a, b) => ORDER.indexOf(a.key) - ORDER.indexOf(b.key));
  const total = sorted.reduce((n, g) => n + g.count, 0);

  return (
    <section className="rounded-[2rem] border border-amber-500/30 bg-amber-500/[0.06] p-4 sm:p-5 shadow-sm">
      <div className="mb-3 flex items-center gap-2 px-1">
        <AlertTriangle className="h-4 w-4 text-amber-600" />
        <h2 className="text-sm font-black uppercase tracking-widest">Needs your attention</h2>
        <span className="ml-auto rounded-full bg-amber-500 px-2.5 py-0.5 text-xs font-black text-white">{total}</span>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {sorted.map((g) => {
          const m = META[g.key];
          return (
            <Link
              key={g.key}
              href={m.href}
              className="group flex items-start gap-3 rounded-2xl border bg-card p-3 transition-colors hover:border-primary/40"
            >
              <span className={`mt-0.5 rounded-xl p-2 ${m.tone}`}>{m.icon}</span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="text-sm font-bold">{m.label}</span>
                  <span className="rounded-full bg-foreground px-2 text-[11px] font-black text-background">{g.count}</span>
                </span>
                {g.preview.length > 0 && (
                  <span className="mt-1 block space-y-0.5">
                    {g.preview.map((p, i) => (
                      <span key={i} className="block truncate text-xs text-muted-foreground">{p}</span>
                    ))}
                    {g.count > g.preview.length && (
                      <span className="block text-xs text-muted-foreground">+{g.count - g.preview.length} more</span>
                    )}
                  </span>
                )}
              </span>
              <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </Link>
          );
        })}
      </div>
    </section>
  );
}
