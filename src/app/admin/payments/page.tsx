
'use client';

import { useState, useCallback, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { History, CheckCircle, Hourglass, Loader2, ExternalLink, XCircle, Check, Trash2, IndianRupee, ChevronsUpDown, ShieldAlert, SquareCheck, Square, DollarSign, Package, Coins, ShoppingBag, Plus, Zap, Sparkles, Tag, Gift, RefreshCw, AlertTriangle, Satellite, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { CreditUsageSummary } from '@/components/admin/credit-usage-summary';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/context/auth-provider';
import { useFirestore } from '@/firebase';
import { collection, query, where, orderBy, getDocs, limit, startAfter, type QueryDocumentSnapshot, DocumentData } from 'firebase/firestore';
import type { PendingPayment, Order } from '@/lib/types';
import { Skeleton } from '@/components/ui/skeleton';
import { format } from 'date-fns';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { manuallyApprovePayment, deletePendingPayment, bulkDeletePayments, getRecentRazorpayPayments, manualGrantRazorpayPaymentAction, rejectRazorpayPaymentFlagAction } from './actions';
import { cn } from '@/lib/utils';
import { reportClientError } from '@/lib/report-client-error';

// Unified type for display
type UnifiedTransaction = (PendingPayment & { type: 'credits'; userEmail: string; createdAt: string; bonusCredits?: number }) | (Order & { type: 'asset' });

function TransactionCard({ 
    transaction, 
    onAdminAction,
    isSelected,
    onToggleSelect
}: { 
    transaction: UnifiedTransaction, 
    onAdminAction: (id: string, change: 'approved' | 'deleted') => void,
    isSelected: boolean,
    onToggleSelect: (id: string) => void
}) {
    const [isApproving, setIsApproving] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const { toast } = useToast();
    const { user } = useAuth();

    const handleApprove = async () => {
        if (transaction.type !== 'credits' || !user) return;
        setIsApproving(true);
        try {
            const idToken = await user.getIdToken();
            const result = await manuallyApprovePayment(idToken, transaction.id);
            if (result.success) {
                toast({ title: 'Success', description: result.message });
                onAdminAction(transaction.id, 'approved');
            } else {
                toast({ variant: 'destructive', title: 'Error', description: result.message });
            }
        } catch (error: any) {
            reportClientError('src/app/admin/payments/page.tsx:approve', error);
            toast({ variant: 'destructive', title: 'Error', description: error.message });
        } finally {
            setIsApproving(false);
        }
    };

    const handleDelete = async () => {
       if (transaction.type !== 'credits' || !user) return;
       setIsDeleting(true);
       try {
           const idToken = await user.getIdToken();
           const result = await deletePendingPayment(idToken, transaction.id);
           if (result.success) {
               toast({ title: 'Success', description: result.message });
               onAdminAction(transaction.id, 'deleted');
           } else {
               toast({ variant: 'destructive', title: 'Error', description: result.message });
           }
       } catch (error: any) {
           reportClientError('src/app/admin/payments/page.tsx:delete', error);
           toast({ variant: 'destructive', title: 'Error', description: error.message });
       } finally {
           setIsDeleting(false);
       }
    };

    const getStatusBadge = () => {
        if (transaction.type === 'asset') {
            return (
                <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 gap-1 px-2 h-6 text-[10px]">
                    <CheckCircle className="h-3 w-3" /> Paid
                </Badge>
            );
        }

        switch (transaction.status) {
            case 'approved':
                return (
                    <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 gap-1 px-2 h-6 text-[10px]">
                        <CheckCircle className="h-3 w-3" /> Approved
                    </Badge>
                );
            case 'pending':
                 return (
                    <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-300 gap-1 px-2 h-6 text-[10px] animate-pulse">
                        <ShieldAlert className="h-3 w-3" /> Pending
                    </Badge>
                );
            case 'rejected':
                 return (
                    <Badge variant="destructive" className="gap-1 px-2 h-6 text-[10px]">
                        <XCircle className="h-3 w-3" /> Rejected
                    </Badge>
                );
            default:
                return <Badge variant="secondary" className="h-6 text-[10px]">{(transaction as any).status}</Badge>
        }
    }

    const isCredits = transaction.type === 'credits';
    const isAsset = transaction.type === 'asset';
    const isPending = isCredits && transaction.status === 'pending';
    const canSelect = isCredits && transaction.status !== 'approved';
    const currencySymbol = transaction.currency === 'USD' ? '$' : '₹';

    return (
        <Card className={cn(
            "overflow-hidden border shadow-sm flex flex-col h-full bg-card transition-all relative",
            isPending ? "ring-1 ring-amber-500/30 bg-amber-50/20" : "",
            isAsset ? "border-purple-500/20 bg-purple-50/5 ring-1 ring-purple-500/10" : "",
            isSelected ? "ring-2 ring-primary border-primary shadow-md scale-[1.01]" : ""
        )}>
            {/* Selection Checkbox */}
            {canSelect && (
                <div className="absolute top-2 left-2 z-10">
                    <Checkbox 
                        checked={isSelected} 
                        onCheckedChange={() => onToggleSelect(transaction.id)} 
                        className="bg-background h-5 w-5"
                    />
                </div>
            )}

            {/* Header Info */}
            <div className={cn("p-4 pb-2 flex justify-between items-start gap-2", canSelect && "pl-10")}>
                <div className="min-w-0">
                    <p className="font-bold text-sm truncate leading-tight">{transaction.userEmail.split('@')[0]}</p>
                    <p className="text-[10px] text-muted-foreground truncate">{transaction.userEmail}</p>
                </div>
                {getStatusBadge()}
            </div>

            <Separator className="opacity-50" />

            {/* Price & Entry Type */}
            <div className={cn(
                "p-4 grid grid-cols-2 gap-2",
                isAsset ? "bg-purple-500/5" : isPending ? "bg-amber-100/20" : "bg-muted/10"
            )}>
                <div>
                    <p className="text-[9px] text-muted-foreground uppercase font-black tracking-widest mb-1">Received</p>
                    <div className="flex items-center gap-1.5">
                        {isAsset ? <ShoppingBag className="h-4 w-4 text-purple-600" /> : <Coins className="h-4 w-4 text-primary" />}
                        <p className={cn("text-xl font-black tracking-tighter", isAsset ? "text-purple-700" : "")}>
                            {currencySymbol}{(transaction.amount / 100).toFixed(2)}
                        </p>
                    </div>
                </div>
                <div className="text-right">
                    <p className="text-[9px] text-muted-foreground uppercase font-black tracking-widest mb-1">Entity</p>
                    <div className="flex items-center justify-end gap-1.5">
                        {isCredits ? (
                            <div className="flex flex-col items-end">
                                <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20 font-black text-[10px] gap-1 px-2 h-6">
                                    <Zap className="h-3 w-3" /> {transaction.credits.toLocaleString()}
                                </Badge>
                                {(transaction as any).bonusCredits > 0 && (
                                    <span className="text-[8px] font-black text-green-600 mt-1 flex items-center gap-1">
                                        <Gift className="h-2 w-2" /> BONUS: +{(transaction as any).bonusCredits.toLocaleString()}
                                    </span>
                                )}
                            </div>
                        ) : (
                            <Badge variant="outline" className="bg-purple-100 text-purple-700 border-purple-300 font-black text-[10px] gap-1 px-2 h-6 shadow-sm">
                                <Sparkles className="h-3 w-3" /> ASSET
                            </Badge>
                        )}
                    </div>
                </div>
            </div>
            
            <div className="px-4 pb-4 flex-grow flex flex-col justify-between">
                <div className="flex flex-col py-3 gap-2">
                    <div className="flex items-center justify-between">
                        <Badge variant="secondary" className={cn(
                            "font-bold text-[9px] px-2 h-5 truncate max-w-[120px]",
                            isAsset && "bg-purple-50 text-purple-700 border-purple-100"
                        )}>
                            {isCredits ? (transaction as any).planName : (transaction as any).productTitle || 'Digital Asset'}
                        </Badge>
                        <p className="text-[10px] text-muted-foreground font-mono whitespace-nowrap ml-2">{format(new Date(transaction.createdAt), 'MMM d, p')}</p>
                    </div>
                    
                    {isCredits && (transaction as any).promoCode && (
                        <div className="flex items-center gap-2 bg-green-50 p-1.5 px-2 rounded-lg border border-green-100 animate-in fade-in">
                            <Tag className="h-3 w-3 text-green-600" />
                            <span className="text-[9px] font-black text-green-700 uppercase tracking-widest">CODE: {(transaction as any).promoCode}</span>
                        </div>
                    )}
                </div>

                <div className="space-y-2">
                    {transaction.paymentId && (
                         <Button asChild variant="ghost" size="sm" className={cn(
                             "h-7 text-[9px] w-full justify-start px-2 font-mono text-muted-foreground bg-muted/20",
                             isAsset && "bg-purple-50/50 hover:bg-purple-100/50"
                         )}>
                            <a href={`https://dashboard.razorpay.com/app/payments/${transaction.paymentId}`} target="_blank" rel="noopener noreferrer">
                               <ExternalLink className="mr-2 h-3 w-3" />
                               {transaction.paymentId}
                            </a>
                        </Button>
                    )}
                    
                    {isPending && (
                        <div className="grid grid-cols-2 gap-2 pt-1">
                            <AlertDialog>
                                <AlertDialogTrigger asChild>
                                    <Button variant="outline" size="sm" className="h-9 text-xs text-destructive hover:bg-destructive/10 border-destructive/20 font-bold" disabled={isDeleting}>
                                        <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                                        Purge
                                    </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent className="rounded-[2rem]">
                                    <AlertDialogHeader>
                                        <AlertDialogTitle>Delete Record?</AlertDialogTitle>
                                        <AlertDialogDescription>Delete this entry for {transaction.userEmail}?</AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                        <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
                                        <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90 rounded-xl">Delete</AlertDialogAction>
                                    </AlertDialogFooter>
                                </AlertDialogContent>
                            </AlertDialog>

                            <AlertDialog>
                                <AlertDialogTrigger asChild>
                                     <Button variant="default" size="sm" className="h-9 text-xs bg-green-600 hover:bg-green-700 text-white font-bold" disabled={isApproving}>
                                        {isApproving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Check className="mr-1.5 h-3.5 w-3.5"/>}
                                        Approve
                                     </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent className="rounded-[2rem]">
                                    <AlertDialogHeader>
                                        <AlertDialogTitle>Approve Payment?</AlertDialogTitle>
                                        <AlertDialogDescription>Add credits to this user and finalize record?</AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                        <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
                                        <AlertDialogAction onClick={handleApprove} className="bg-green-600 hover:bg-green-700 rounded-xl">Approve</AlertDialogAction>
                                    </AlertDialogFooter>
                                </AlertDialogContent>
                            </AlertDialog>
                        </div>
                    )}
                </div>
            </div>
        </Card>
    )
}

/**
 * 🛰️ Ground-truth panel: reads recent Razorpay orders directly from
 * Razorpay's own API, not our side-effect collections — so it can catch a
 * payment that's genuinely captured on Razorpay's side but never made it
 * into our own tracking (client confirm lost + webhook missed/down for
 * that one delivery). Anything flagged "Not Credited" gets a one-click
 * recovery button that re-runs the same idempotent grant logic.
 */
function RazorpayGroundTruthPanel() {
    const { user } = useAuth();
    const { toast } = useToast();
    const [payments, setPayments] = useState<any[] | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [grantingId, setGrantingId] = useState<string | null>(null);
    const [rejectingId, setRejectingId] = useState<string | null>(null);
    // 🔴 NEW: there was no way to look up a SPECIFIC user's/track's stuck
    // payment here beyond eyeballing the list — an admin chasing one
    // reported case (e.g. "user X says they bought 3 songs, none
    // unlocked") had to scroll and pattern-match by eye. Client-side
    // filter over the already-fetched page — good enough at this list
    // size, no extra server round-trip needed.
    const [searchQuery, setSearchQuery] = useState('');

    const fetchPayments = useCallback(async () => {
        if (!user) return;
        setIsLoading(true);
        try {
            const idToken = await user.getIdToken();
            // Bumped from 50 -> 100 (Razorpay's own per-call max) so a
            // search for an older stuck payment is more likely to still be
            // on this one page instead of having scrolled off it.
            const result = await getRecentRazorpayPayments(idToken, 100);
            if (result.success) {
                setPayments(result.payments || []);
            } else {
                toast({ variant: 'destructive', title: 'Could not load Razorpay payments', description: result.message });
            }
        } catch (error: any) {
            reportClientError('src/app/admin/payments/page.tsx:razorpayGroundTruth', error);
            toast({ variant: 'destructive', title: 'Error', description: error.message });
        } finally {
            setIsLoading(false);
        }
    }, [user, toast]);

    useEffect(() => {
        fetchPayments();
    }, [fetchPayments]);

    const handleGrant = async (paymentId: string) => {
        if (!user) return;
        setGrantingId(paymentId);
        try {
            const idToken = await user.getIdToken();
            const result = await manualGrantRazorpayPaymentAction(idToken, paymentId);
            if (result.success) {
                toast({ title: 'Success', description: result.message });
                // Flip the row now; the full re-fetch takes several seconds.
                setPayments(prev => (prev || []).map(p => p.paymentId === paymentId ? { ...p, credited: true } : p));
                fetchPayments();
            } else {
                toast({ variant: 'destructive', title: 'Grant Failed', description: result.message });
            }
        } catch (error: any) {
            reportClientError('src/app/admin/payments/page.tsx:manualGrant', error);
            toast({ variant: 'destructive', title: 'Error', description: error.message });
        } finally {
            setGrantingId(null);
        }
    };

    const handleReject = async (paymentId: string) => {
        if (!user) return;
        if (!window.confirm('Dismiss this flag? It will stop showing as needing action, and nothing gets granted.')) return;
        setRejectingId(paymentId);
        try {
            const idToken = await user.getIdToken();
            const result = await rejectRazorpayPaymentFlagAction(idToken, paymentId);
            if (result.success) {
                toast({ title: 'Dismissed', description: result.message });
                setPayments(prev => (prev || []).map(p => p.paymentId === paymentId ? { ...p, dismissed: true } : p));
                fetchPayments();
            } else {
                toast({ variant: 'destructive', title: 'Could Not Dismiss', description: result.message });
            }
        } catch (error: any) {
            reportClientError('src/app/admin/payments/page.tsx:reject', error);
            toast({ variant: 'destructive', title: 'Error', description: error.message });
        } finally {
            setRejectingId(null);
        }
    };

    const uncreditedCount = (payments || []).filter(p => !p.credited && !p.dismissed).length;
    const filteredPayments = (payments || []).filter((p) => {
        const q = searchQuery.trim().toLowerCase();
        if (!q) return true;
        return [p.email, p.userId, p.planName, p.paymentId, p.orderId]
            .filter(Boolean)
            .some((field) => String(field).toLowerCase().includes(q));
    });

    return (
        <Card className="rounded-[2.5rem] border-none shadow-xl bg-card overflow-hidden">
            <CardHeader className="bg-primary/5 border-b border-primary/10 pb-6 flex flex-row items-center justify-between gap-4">
                <div>
                    <CardTitle className="text-lg font-black uppercase tracking-tight flex items-center gap-3">
                        <Satellite className="h-5 w-5 text-primary" />
                        Razorpay Ground Truth
                        {uncreditedCount > 0 && (
                            <Badge variant="destructive" className="text-[10px] font-black">{uncreditedCount} NOT CREDITED</Badge>
                        )}
                    </CardTitle>
                    <CardDescription className="text-[10px] font-bold uppercase tracking-widest mt-1">
                        Last 100 orders, read live from Razorpay — catches a paid order our own tracking missed.
                    </CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={fetchPayments} disabled={isLoading} className="h-9 px-4 rounded-xl text-[10px] font-black uppercase tracking-widest shrink-0">
                    {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                </Button>
            </CardHeader>
            {payments && payments.length > 0 && (
                <div className="p-4 sm:p-5 border-b bg-muted/10">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
                        <Input
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Search by email, payment ID, or track/plan name…"
                            className="h-10 pl-9 rounded-xl text-sm"
                        />
                    </div>
                </div>
            )}
            <CardContent className="p-0">
                {isLoading && !payments ? (
                    <div className="p-8 space-y-3">
                        <Skeleton className="h-14 w-full rounded-xl" />
                        <Skeleton className="h-14 w-full rounded-xl" />
                    </div>
                ) : !payments || payments.length === 0 ? (
                    <p className="p-8 text-sm text-muted-foreground text-center">No recent Razorpay orders found.</p>
                ) : filteredPayments.length === 0 ? (
                    <p className="p-8 text-sm text-muted-foreground text-center">No payments match "{searchQuery}".</p>
                ) : (
                    <div className="divide-y divide-border/50">
                        {filteredPayments.map((p) => (
                            <div key={p.paymentId} className={cn("flex items-center justify-between gap-4 p-4 sm:p-5", !p.credited && !p.dismissed && "bg-destructive/5")}>
                                <div className="min-w-0">
                                    <div className="flex items-center gap-2">
                                        {!p.credited && !p.dismissed && <AlertTriangle className="h-3.5 w-3.5 text-destructive shrink-0" />}
                                        <span className="font-bold text-sm truncate">{p.email || p.userId || 'Unknown user'}</span>
                                        <Badge variant="outline" className="text-[9px] font-black uppercase shrink-0">{p.status}</Badge>
                                    </div>
                                    <p className="text-xs text-muted-foreground mt-0.5">
                                        ₹{p.amount} {p.planName ? `· ${p.planName}` : ''} · {format(new Date(p.createdAt), 'dd MMM, p')}
                                    </p>
                                    <p className="text-[9px] font-mono text-muted-foreground/60 mt-0.5 truncate">{p.paymentId}</p>
                                </div>
                                {p.credited ? (
                                    <Badge className="bg-green-500/10 text-green-600 border-green-500/20 shrink-0 text-[9px] font-black uppercase">
                                        <Check className="h-3 w-3 mr-1" /> Credited
                                    </Badge>
                                ) : p.dismissed ? (
                                    <Badge variant="outline" className="text-muted-foreground shrink-0 text-[9px] font-black uppercase">
                                        Dismissed
                                    </Badge>
                                ) : (
                                    <div className="flex items-center gap-2 shrink-0">
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            className="h-9 px-3 rounded-xl text-[10px] font-black uppercase tracking-widest text-muted-foreground hover:text-destructive"
                                            onClick={() => handleReject(p.paymentId)}
                                            disabled={rejectingId === p.paymentId || grantingId === p.paymentId}
                                        >
                                            {rejectingId === p.paymentId ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Reject'}
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="destructive"
                                            className="h-9 px-4 rounded-xl text-[10px] font-black uppercase tracking-widest"
                                            onClick={() => handleGrant(p.paymentId)}
                                            disabled={grantingId === p.paymentId || rejectingId === p.paymentId}
                                        >
                                            {grantingId === p.paymentId ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Grant Now'}
                                        </Button>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

export default function PaymentsPage() {
    const { user: currentUser } = useAuth();
    const firestore = useFirestore();
    const { toast } = useToast();

    // 🔴 NEW: Razorpay Ground Truth used to sit permanently inline above the
    // Transaction Log, always fetching/rendering even for an admin who just
    // wants the normal payments view — a toggle (same visual pattern as
    // VoiceEngineToggle in studio/voice-engine.tsx) switches between the
    // two instead, so only one section's content is out at a time.
    const [paymentsView, setPaymentsView] = useState<'normal' | 'ground_truth'>('normal');

    const [transactions, setTransactions] = useState<UnifiedTransaction[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    
    // Pagination state
    const [itemsLimit, setItemsLimit] = useState(15);
    const [hasMore, setHasMore] = useState(true);

    // Multi-selection state (Only for Credits)
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [isBulkDeleting, setIsBulkDeleting] = useState(false);

    const fetchHistory = useCallback(async (currentLimit: number) => {
        if (!firestore || !currentUser?.role) {
            setIsLoading(false);
            return;
        }

        setIsLoading(true);
        setSelectedIds([]);
        
        try {
            const [paymentsSnap, storeSnap] = await Promise.all([
                getDocs(query(collection(firestore, 'pendingPayments'), orderBy('createdAt', 'desc'), limit(currentLimit))),
                getDocs(query(collection(firestore, 'storeHistory'), where('status', '==', 'paid'), orderBy('createdAt', 'desc'), limit(currentLimit)))
            ]);

            const paymentList = paymentsSnap.docs.map(doc => {
                const data = doc.data();
                return { 
                    id: doc.id, 
                    ...data, 
                    userEmail: data.email || data.userEmail || '',
                    createdAt: data.timestamp || data.createdAt || new Date().toISOString(),
                    type: 'credits' as const 
                } as UnifiedTransaction;
            });

            const storeList = storeSnap.docs.map(doc => ({ 
                id: doc.id, 
                ...doc.data(), 
                type: 'asset' as const 
            } as UnifiedTransaction));

            const combined = [...paymentList, ...storeList].sort((a, b) => 
                new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
            );

            const finalDisplayList = combined.slice(0, currentLimit);
            setTransactions(finalDisplayList);
            setHasMore(combined.length >= currentLimit);

        } catch (error) {
        reportClientError('src/app/admin/payments/page.tsx:321', error);
            console.error("Failed to fetch transaction history:", error);
            toast({ variant: "destructive", title: "Error", description: "Could not load transaction feed." });
        } finally {
            setIsLoading(false);
        }
    }, [firestore, currentUser?.role, toast]);

    useEffect(() => {
        fetchHistory(itemsLimit);
    }, [fetchHistory, itemsLimit]);

    const handleLoadMore = () => {
        setItemsLimit(prev => prev + 15);
    };

    // Reflect the change on the card immediately; the re-fetch is slow.
    const handleAdminAction = (id: string, change: 'approved' | 'deleted') => {
        setTransactions(prev => change === 'deleted'
            ? prev.filter(t => t.id !== id)
            : prev.map(t => t.id === id ? ({ ...t, status: 'approved' } as UnifiedTransaction) : t));
        fetchHistory(itemsLimit);
    };

    const toggleSelect = (id: string) => {
        setSelectedIds(prev => 
            prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
        );
    };

    const selectAllUnapproved = () => {
        const selectableIds = transactions
            .filter(t => t.type === 'credits' && t.status !== 'approved')
            .map(t => t.id);
            
        if (selectedIds.length === selectableIds.length) {
            setSelectedIds([]);
        } else {
            setSelectedIds(selectableIds);
        }
    };

    const handleBulkDelete = async () => {
        if (selectedIds.length === 0 || !currentUser) return;
        setIsBulkDeleting(true);
        try {
            const idToken = await currentUser.getIdToken();
            const result = await bulkDeletePayments(idToken, selectedIds);
            if (result.success) {
                toast({ title: 'Success', description: result.message });
                const removed = new Set(selectedIds);
                setTransactions(prev => prev.filter(t => !removed.has(t.id)));
                setSelectedIds([]);
                fetchHistory(itemsLimit);
            } else {
                toast({ variant: 'destructive', title: 'Bulk Delete Failed', description: result.message });
            }
        } catch (error: any) {
            reportClientError('src/app/admin/payments/page.tsx:bulkDelete', error);
            toast({ variant: 'destructive', title: 'Error', description: error.message });
        } finally {
            setIsBulkDeleting(false);
        }
    };

    const selectableCount = transactions.filter(t => t.type === 'credits' && t.status !== 'approved').length;

    return (
        <div className="space-y-10">
            <div className="space-y-1 px-1">
                <h1 className="text-3xl font-black uppercase tracking-tight">System Revenue</h1>
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest opacity-60">Consolidated financial records.</p>
            </div>
            
            <CreditUsageSummary />

            <div className="grid grid-cols-2 gap-2">
                <button
                    type="button"
                    onClick={() => setPaymentsView('normal')}
                    className={cn(
                        'rounded-xl border p-3 text-left transition-colors',
                        paymentsView === 'normal'
                            ? 'border-primary bg-primary/10'
                            : 'border-border hover:border-primary/40 hover:bg-muted/40'
                    )}
                >
                    <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-bold flex items-center gap-2"><History className="h-4 w-4" /> Normal Payments</span>
                        {paymentsView === 'normal' && (
                            <Badge className="h-5 px-1.5 text-[9px] font-black text-white shrink-0 bg-primary hover:bg-primary">ON</Badge>
                        )}
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-0.5">Transaction log — credits &amp; store assets</p>
                </button>
                <button
                    type="button"
                    onClick={() => setPaymentsView('ground_truth')}
                    className={cn(
                        'rounded-xl border p-3 text-left transition-colors',
                        paymentsView === 'ground_truth'
                            ? 'border-primary bg-primary/10'
                            : 'border-border hover:border-primary/40 hover:bg-muted/40'
                    )}
                >
                    <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-bold flex items-center gap-2"><Satellite className="h-4 w-4" /> Razorpay Ground Truth</span>
                        {paymentsView === 'ground_truth' && (
                            <Badge className="h-5 px-1.5 text-[9px] font-black text-white shrink-0 bg-primary hover:bg-primary">ON</Badge>
                        )}
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-0.5">Live from Razorpay — recovers a missed payment</p>
                </button>
            </div>

            {paymentsView === 'ground_truth' && <RazorpayGroundTruthPanel />}

            {paymentsView === 'normal' && (
            <Card className="rounded-[2.5rem] border-none shadow-xl bg-card overflow-hidden">
                <CardHeader className="bg-primary/5 border-b border-primary/10 pb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div>
                        <CardTitle className="text-lg font-black uppercase tracking-tight flex items-center gap-3">
                            <History className="h-5 w-5 text-primary" />
                            Transaction Log
                        </CardTitle>
                        <CardDescription className="text-[10px] font-bold uppercase tracking-widest mt-1">Unified view of credits and assets.</CardDescription>
                    </div>
                    {transactions.length > 0 && !isLoading && (
                        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                             <Button 
                                variant="outline" 
                                size="sm" 
                                onClick={selectAllUnapproved}
                                className="text-[10px] font-black uppercase tracking-widest h-9 px-4 rounded-xl flex-1 sm:flex-initial"
                                disabled={selectableCount === 0}
                            >
                                {selectedIds.length === selectableCount && selectableCount > 0 ? (
                                    <><SquareCheck className="mr-2 h-4 w-4" /> Deselect</>
                                ) : (
                                    <><Square className="mr-2 h-4 w-4" /> Select All</>
                                )}
                            </Button>
                            
                            {selectedIds.length > 0 && (
                                <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                        <Button variant="destructive" size="sm" className="h-9 px-4 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg animate-in zoom-in-95 flex-1 sm:flex-initial" disabled={isBulkDeleting}>
                                            <Trash2 className="mr-2 h-4 w-4" />
                                            Purge ({selectedIds.length})
                                        </Button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent className="rounded-[2.5rem]">
                                        <AlertDialogHeader>
                                            <AlertDialogTitle className="text-xl font-black uppercase">Bulk Delete?</AlertDialogTitle>
                                            <AlertDialogDescription className="text-sm font-medium">
                                                You are about to delete <b>{selectedIds.length}</b> records permanently.
                                            </AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter className="mt-6 gap-3">
                                            <AlertDialogCancel className="rounded-xl font-bold">Cancel</AlertDialogCancel>
                                            <AlertDialogAction onClick={handleBulkDelete} className="bg-destructive hover:bg-destructive/90 rounded-xl font-black">
                                                Confirm Purge
                                            </AlertDialogAction>
                                        </AlertDialogFooter>
                                    </AlertDialogContent>
                                </AlertDialog>
                            )}
                        </div>
                    )}
                </CardHeader>
                <CardContent className="pt-8">
                    {isLoading && transactions.length === 0 ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                        {Array.from({ length: 8 }).map((_, i) => (
                            <Skeleton key={i} className="h-48 w-full rounded-[2rem]" />
                        ))}
                        </div>
                    ) : transactions && transactions.length > 0 ? (
                        <>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                                {transactions.map(transaction => (
                                    <TransactionCard 
                                        key={transaction.id} 
                                        transaction={transaction} 
                                        onAdminAction={handleAdminAction}
                                        isSelected={selectedIds.includes(transaction.id)}
                                        onToggleSelect={toggleSelect}
                                    />
                                ))}
                            </div>
                            
                            {hasMore && (
                                <div className="flex justify-center mt-12 mb-4">
                                    <Button 
                                        variant="outline" 
                                        onClick={handleLoadMore} 
                                        disabled={isLoading}
                                        className="h-12 px-10 rounded-2xl border-primary/20 hover:bg-primary/5 font-black uppercase tracking-widest text-xs gap-3 shadow-sm"
                                    >
                                        {isLoading ? (
                                            <Loader2 className="h-4 w-4 animate-spin text-primary" />
                                        ) : (
                                            <Plus className="h-4 w-4 text-primary" />
                                        )}
                                        Load More Entries
                                    </Button>
                                </div>
                            )}
                        </>
                    ) : (
                        <div className="h-64 flex flex-col items-center justify-center text-muted-foreground opacity-20 italic">
                            <History className="h-16 w-16 mb-4" />
                            <p className="text-xl font-bold uppercase tracking-widest">Archive Empty</p>
                        </div>
                    )}
                </CardContent>
            </Card>
            )}
        </div>
    );
}
