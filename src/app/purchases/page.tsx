'use client';

import { PurchaseHistory } from '@/components/history/purchase-history';
import { Header } from '@/components/header';
import { CheckSquare, ShoppingBag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

export default function PurchasesPage() {
    return (
        <>
            <Header />
            <div className="container mx-auto max-w-5xl py-10 px-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
                    <div>
                        <h1 className="text-3xl font-black uppercase tracking-tight flex items-center gap-3">
                            <CheckSquare className="text-primary h-8 w-8" />
                            My Purchases
                        </h1>
                        <p className="text-muted-foreground font-medium">Digital assets and scripts you have acquired.</p>
                    </div>
                    <Button asChild variant="outline" className="rounded-xl h-11 px-6 font-bold gap-2">
                        <Link href="/store">
                            <ShoppingBag className="h-4 w-4" />
                            Visit Store
                        </Link>
                    </Button>
                </div>

                <div className="mt-8">
                    <PurchaseHistory />
                </div>
            </div>
        </>
    );
}
