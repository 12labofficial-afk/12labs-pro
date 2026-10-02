
import { Star, Gem, Briefcase, Rocket, TestTube, Youtube } from 'lucide-react';
import { YouTubeLogo } from '@/components/icons';

export interface Plan {
    id: string;
    name: string;
    priceInRupees: number; 
    priceInUSD: number;    
    originalPriceInUSD?: number;
    originalPriceInRupees?: number;
    credits: number;
    features: string[];
    icon: any;
    bestValue?: boolean;
    isTest?: boolean;
    isAutopay?: boolean;
    weeklyCredits?: number;
    profitAmount?: number;
    /** Days between recurring installment grants (default 7 if unset). */
    grantIntervalDays?: number;
    /** Total number of installments before the plan auto-completes (default 4 if unset). */
    maxGrants?: number;
    /** Store Tickets granted with the pack (each = one free Verified Partner asset). */
    storeTickets?: number;
    /** Autopay plans: ticket granted with each of these installment numbers (1-based). */
    ticketWeeks?: number[];
}

export const plans: Plan[] = [
    {
        id: 'test',
        name: 'Test Plan',
        priceInRupees: 1,
        priceInUSD: 0.1,
        credits: 2,
        features: [
            'Test generation',
            '1 Rupee only',
        ],
        icon: TestTube,
        isTest: true,
    },
    {
        id: 'test_sub',
        name: 'Test Sub (Weekly)',
        priceInRupees: 1,
        priceInUSD: 0.1,
        credits: 2,
        features: [
            'Test subscription',
            '1 Rupee weekly auto-debit',
            'Cancel anytime instantly',
        ],
        icon: TestTube,
        isTest: true,
        isAutopay: true,
        weeklyCredits: 2,
        // 2 credits granted once a day for 7 days (matches the 7-day auto-debit cycle).
        grantIntervalDays: 1,
        maxGrants: 7,
    },
    {
        id: 'starter',
        name: 'Starter',
        priceInRupees: 139, 
        priceInUSD: 2.2,
        credits: 10000, 
        features: [
            'Voice editing (Included)',
            'Access to all AI voices',
            'Usage rights — no copyright issues',
            'MP3 & WAV lossless download',
        ],
        icon: Star,
    },
    {
        id: 'pro',
        name: 'Pro',
        priceInRupees: 331, 
        priceInUSD: 6,
        originalPriceInUSD: 7,
        // 30,000 + 1,000 bonus (the bonus moved here from Starter).
        credits: 31000,
        features: [
            '1 Store Ticket',
            '+ 1,000 Bonus Credits! 🎁',
            'Voice editing (Included)',
            'Access to all AI voices',
            'Commercial usage rights — no copyright issues',
            'MP3 & WAV lossless download',
            'ZIP audio dialogue bundle',
        ],
        storeTickets: 1,
        icon: Gem,
    },
    {
        id: 'business',
        name: 'Business',
        priceInRupees: 534, 
        priceInUSD: 8,
        originalPriceInUSD: 10,
        credits: 50000,
        features: [
            '2 Store Tickets',
            'Priority production node',
            'Voice editing (Included)',
            'Commercial usage rights — no copyright issues',
            'MP3 & WAV lossless download',
            'ZIP audio dialogue bundle',
        ],
        storeTickets: 2,
        icon: Briefcase,
    },
    {
        id: 'enterprise',
        name: 'Enterprise',
        priceInRupees: 999, 
        priceInUSD: 12.5,
        credits: 100000,
        profitAmount: 310, 
        features: [
            '3 Store Tickets',
            'Priority production node',
            'Full commercial usage rights — no copyright issues',
            'Voice editing (Included)',
            'Single dialogue extraction',
            'MP3 & WAV lossless download',
            'ZIP audio dialogue bundle',
        ],
        storeTickets: 3,
        icon: Rocket,
        bestValue: true,
    },
    {
        id: 'autopay_pro',
        name: 'Consistent Creator',
        priceInRupees: 700, 
        priceInUSD: 10.5,
        credits: 80000,
        weeklyCredits: 20000,
        features: [
            '2 Store Tickets — Week 1 & Week 3',
            'Build your Consistency Habit 📢',
            'Voice editing (Included)',
            'Credits valid for 30 days from purchase',
            'Full commercial usage rights — no copyright issues',
            'Single dialogue extraction',
            'MP3 & WAV lossless download',
            'ZIP audio dialogue bundle',
        ],
        icon: YouTubeLogo,
        ticketWeeks: [1, 3],
        isAutopay: true,
        // 20,000 credits granted once a week for 4 weeks (28 days total).
        grantIntervalDays: 7,
        maxGrants: 4,
    },
];
