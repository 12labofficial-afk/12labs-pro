'use client';

import { AuthForm } from '@/components/auth-form';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/context/auth-provider';
import { useState, useRef, useEffect, Suspense } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Loader2, ShieldAlert } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { reportClientError } from '@/lib/report-client-error';

function LoginPageContent() {
  const { user, loading: authLoading, loginWithEmail } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  
  const [isAdminDialogOpen, setIsAdminDialogOpen] = useState(false);
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const longPressTimer = useRef<NodeJS.Timeout | null>(null);

  const handleMouseDown = () => {
    longPressTimer.current = setTimeout(() => {
      setIsAdminDialogOpen(true);
    }, 5000); 
  };

  const handleMouseUp = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
    }
  };
  
  const handleAdminLogin = async () => {
    if (!adminEmail.trim() || !adminPassword) {
      toast({ variant: 'destructive', title: 'Email and Password Required' });
      return;
    }
    setIsLoggingIn(true);
    try {
      // Never hardcode an admin address here — this file ships to every visitor's browser.
      await loginWithEmail(adminEmail.trim(), adminPassword);
      toast({ title: 'Admin Login Successful' });
      setIsAdminDialogOpen(false);
    } catch (error: any) {
            reportClientError('src/app/login/page.tsx:50', error);
      toast({ variant: 'destructive', title: 'Admin Login Failed' });
    } finally {
      setIsLoggingIn(false);
      setAdminPassword('');
    }
  };

  useEffect(() => {
    if (!authLoading && user) {
        const redirectTo = searchParams.get('redirect') || '/';
        router.replace(redirectTo);
    }
  }, [user, authLoading, searchParams, router]);

  if (authLoading || user) {
     return (
      <div className="flex min-h-screen items-center justify-center bg-transparent">
        <div className="flex flex-col items-center gap-4 text-muted-foreground animate-in fade-in duration-500">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <p className="font-black uppercase tracking-widest text-[10px]">Signing you in...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-[100dvh] items-center justify-center overflow-hidden bg-[#f6f8fc] dark:bg-zinc-950">
        {/* Background: soft moving glows + fine grid. transform/opacity only. */}
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="login-orb absolute -left-24 -top-24 h-[340px] w-[340px] rounded-full bg-primary/25 blur-[90px]" />
          <div className="login-orb login-orb-2 absolute -bottom-28 -right-20 h-[360px] w-[360px] rounded-full bg-indigo-400/25 blur-[90px]" />
          <div className="absolute inset-0 opacity-60 [background-image:linear-gradient(rgba(15,23,42,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(15,23,42,0.04)_1px,transparent_1px)] [background-size:32px_32px] [mask-image:radial-gradient(ellipse_at_center,black,transparent_75%)] dark:[background-image:linear-gradient(rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.05)_1px,transparent_1px)]" />
        </div>

        <div className="relative z-10 w-full max-w-md px-4 py-10">
          <div className="mb-8 flex flex-col items-center">
              <div
                className="anim-studio-rise cursor-default select-none"
                onMouseDown={handleMouseDown}
                onMouseUp={handleMouseUp}
                onTouchStart={handleMouseDown}
                onTouchEnd={handleMouseUp}
                onMouseLeave={handleMouseUp}
              >
                <div className="anim-studio-float relative mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-[26px] bg-white shadow-[0_20px_50px_-20px_rgba(37,99,235,0.55)] ring-1 ring-black/5 dark:bg-zinc-900 dark:ring-white/10">
                  <img src="/icon-192x192.png" alt="" width={80} height={80} className="h-20 w-20 rounded-[26px]" draggable={false} />
                  <span aria-hidden className="login-ring absolute inset-0 rounded-[26px] ring-2 ring-primary/30" />
                </div>
                <h1 className="flex items-baseline justify-center font-headline tracking-tighter">
                    <span className="text-4xl font-black text-primary">12</span><span className="text-3xl font-black text-foreground">Labs</span>
                </h1>
              </div>
              <p className="anim-studio-rise mt-2 text-center text-sm text-muted-foreground" style={{ animationDelay: '120ms' }}>
                AI voices, scripts and a creator store — in one place.
              </p>
          </div>

          <div className="anim-studio-rise overflow-hidden rounded-[28px] border border-black/[0.06] bg-white/90 shadow-[0_24px_60px_-30px_rgba(37,99,235,0.45)] backdrop-blur-xl dark:border-white/10 dark:bg-zinc-900/80" style={{ animationDelay: '200ms' }}>
              <div aria-hidden className="h-1 w-full bg-gradient-to-r from-primary via-indigo-500 to-fuchsia-500" />
              <div className="px-6 pb-8 pt-7 sm:px-8">
                  <h2 className="text-center text-2xl font-extrabold tracking-tight text-foreground">Welcome back</h2>
                  <p className="mt-1 text-center text-sm text-muted-foreground">Sign in to continue to your studio.</p>
                  <div className="mt-6">
                    <AuthForm />
                  </div>
                  <p className="mt-6 text-center text-xs leading-relaxed text-muted-foreground">
                      By continuing, you agree to our{' '}
                      <Link href="/terms" prefetch={false} className="font-medium underline underline-offset-2 transition-colors hover:text-primary">Terms of Service</Link>
                      {' '}and{' '}
                      <Link href="/privacy" prefetch={false} className="font-medium underline underline-offset-2 transition-colors hover:text-primary">Privacy Policy</Link>.
                  </p>
              </div>
          </div>

          <div className="anim-studio-rise mt-6 flex flex-wrap items-center justify-center gap-2" style={{ animationDelay: '320ms' }}>
            {['2,000 free credits on signup', 'No card needed', 'Secure Google sign-in'].map((t) => (
              <span key={t} className="rounded-full border border-black/[0.06] bg-white/80 px-3 py-1 text-[11px] font-semibold text-muted-foreground shadow-sm backdrop-blur dark:border-white/10 dark:bg-white/5">{t}</span>
            ))}
          </div>
        </div>

        <Dialog open={isAdminDialogOpen} onOpenChange={setIsAdminDialogOpen}>
          <DialogContent className="rounded-[2.5rem] border-none shadow-3xl bg-background">
            <DialogHeader>
              <DialogTitle className="text-2xl font-black flex items-center gap-3 uppercase tracking-tight">
                  <ShieldAlert className="h-6 w-6 text-primary" />
                  Root Override
              </DialogTitle>
              <DialogDescription className="text-xs font-bold uppercase opacity-60">
                  Secure administrator access. Please verify credentials.
              </DialogDescription>
            </DialogHeader>
            <div className="py-6 space-y-3">
              <Input
                type="email"
                autoComplete="username"
                placeholder="Admin Email..."
                value={adminEmail}
                onChange={(e) => setAdminEmail(e.target.value)}
                className="h-14 bg-muted/20 border-primary/10 rounded-2xl font-mono text-center text-lg"
              />
              <Input 
                type="password"
                placeholder="Admin Cipher..."
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleAdminLogin()}
                className="h-14 bg-muted/20 border-primary/10 rounded-2xl font-mono text-center text-lg"
              />
            </div>
            <DialogFooter className="gap-3">
              <Button variant="ghost" onClick={() => setIsAdminDialogOpen(false)} className="rounded-xl font-bold h-12">Abort</Button>
              <Button onClick={handleAdminLogin} disabled={isLoggingIn} className="rounded-xl px-10 font-black h-12 shadow-xl shadow-primary/20 uppercase tracking-widest text-xs">
                {isLoggingIn ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Initiate
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
    </div>
  );
}

export default function LoginPage() {
    return (
        <Suspense fallback={
            <div className="flex min-h-screen items-center justify-center bg-transparent">
                <Loader2 className="h-10 w-10 animate-spin text-primary" />
            </div>
        }>
            <LoginPageContent />
        </Suspense>
    )
}