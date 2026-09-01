'use client';

import { AuthForm } from '@/components/auth-form';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/context/auth-provider';
import { useState, useRef, useEffect, Suspense } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Loader2, ShieldAlert, Sparkles, KeyRound, SeparatorHorizontal } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { reportClientError } from '@/lib/report-client-error';

function LoginPageContent() {
  const { user, loading: authLoading, loginWithEmail } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  
  const [isAdminDialogOpen, setIsAdminDialogOpen] = useState(false);
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
    if (!adminPassword) {
      toast({ variant: 'destructive', title: 'Password Required' });
      return;
    }
    setIsLoggingIn(true);
    try {
      await loginWithEmail('toonday378@gmail.com', adminPassword);
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
          <p className="font-black uppercase tracking-widest text-[10px]">Synchronizing Identity Node...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden bg-transparent">
        
        {/* Animated Aurora Background - Subtle support for bubbles */}
        <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none opacity-20">
            <div className="absolute -top-[10%] -left-[10%] w-[50%] h-[50%] rounded-full bg-primary/10 blur-[120px] animate-aurora" />
            <div className="absolute -bottom-[10%] -right-[10%] w-[40%] h-[40%] rounded-full bg-purple-500/10 blur-[100px] animate-aurora" style={{ animationDelay: '5s' }} />
        </div>

        <div className="relative z-10 w-full max-w-md px-4 py-12">
          <div className="flex flex-col items-center mb-10 space-y-6">
              <div 
                className="cursor-default select-none animate-in fade-in slide-in-from-top-4 duration-1000"
                onMouseDown={handleMouseDown}
                onMouseUp={handleMouseUp}
                onTouchStart={handleMouseDown}
                onTouchEnd={handleMouseUp}
                onMouseLeave={handleMouseUp}
              >
                <div className="flex flex-col items-center text-center space-y-2">
                  <Badge variant="outline" className="h-8 px-4 rounded-full border-primary/20 bg-primary/5 text-primary font-black uppercase tracking-[0.2em] text-[10px] mb-2">
                    <Sparkles className="mr-2 h-3.5 w-3.5" /> AUTHORIZED ACCESS ONLY
                  </Badge>
                  <h1 className="text-5xl font-black tracking-tighter text-foreground font-headline">
                      12Labs <span className="text-primary italic">Studio</span>
                  </h1>
                </div>
              </div>
          </div>

          <Card className="border-white/20 bg-white/20 dark:bg-card/30 backdrop-blur-3xl shadow-3xl rounded-[3.5rem] overflow-hidden border-2">
              <CardHeader className="text-center pt-12 pb-6">
                  <CardTitle className="text-3xl font-black text-foreground tracking-tight uppercase">Access Hub</CardTitle>
                  <CardDescription className="text-muted-foreground font-bold uppercase text-[10px] tracking-widest opacity-60">Continue with your professional account</CardDescription>
              </CardHeader>
              <CardContent className="px-8 pb-12">
                  <div className="bg-white/30 dark:bg-black/20 p-8 rounded-[2.5rem] border border-white/20 shadow-inner">
                      <AuthForm />
                  </div>
              </CardContent>
          </Card>
          
          <div className="mt-12 flex flex-col items-center gap-6">
              <div className="flex items-center gap-6">
                  <Button variant="link" asChild className="text-muted-foreground hover:text-primary transition-colors text-[10px] font-black uppercase tracking-widest h-auto p-0">
                      <Link href="/terms" prefetch={false}>Agreement</Link>
                  </Button>
                  <Separator orientation="vertical" className="h-4 opacity-20" />
                  <Button variant="link" asChild className="text-muted-foreground hover:text-primary transition-colors text-[10px] font-black uppercase tracking-widest h-auto p-0">
                      <Link href="/contact" prefetch={false}>Contact Hub</Link>
                  </Button>
              </div>
              <p className="text-center text-[8px] font-black uppercase tracking-widest text-muted-foreground opacity-30 leading-relaxed max-w-sm">
                  &copy; 2026 12Labs. All Rights Reserved. 12Labs operates as a child company of Green Group Manufacturing. Green Group Manufacturing is the parent company of 12Labs. All intellectual property, including designs, content, branding, and source code, is protected by applicable laws. Unauthorized use, copying, or reproduction may result in legal action.
              </p>
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
            <div className="py-6">
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