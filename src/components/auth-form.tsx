
'use client';

import { useAuth } from '@/context/auth-provider';
import { Button } from '@/components/ui/button';
import { Loader2, ShieldCheck, Sparkles } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useState } from 'react';

function GoogleSignInButton() {
  const { loginWithGoogle } = useAuth();
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleGoogleLogin = async () => {
    setLoading(true);
    try {
      await loginWithGoogle();
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Google Sign-In Failed',
        description: error.message || 'An unknown error occurred.',
      });
      setLoading(false);
    }
  };

  return (
    <Button 
        variant="outline" 
        className="w-full h-14 rounded-2xl bg-white hover:bg-white/90 text-black border-none font-bold text-base shadow-lg transition-all active:scale-95 gap-3" 
        onClick={handleGoogleLogin} 
        disabled={loading}
    >
      {loading ? (
        <Loader2 className="h-5 w-5 animate-spin" />
      ) : (
        <svg
          className="h-5 w-5"
          aria-hidden="true"
          focusable="false"
          data-prefix="fab"
          data-icon="google"
          role="img"
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 48 48"
        >
          <path fill="#4285F4" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 11.827 4 2 13.827 2 26s9.827 22 22 22 22-9.827 22-22c0-1.341-.138-2.65-.389-3.917z" />
          <path fill="#34A853" d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 13 24 13c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z" />
          <path fill="#FBBC05" d="M27.461 40.919l-6.571-4.82c-2.119 1.884-4.902 3-7.961 3-5.04 0-9.345-3.108-11.181-7.56l-6.571 4.819C9.656 41.663 16.318 46 24 46c5.786 0 10.9-2.525 14.539-6.657l-6.078-4.424z" />
          <path fill="#EA4335" d="M43.611 20.083H24v8h11.303c-.792 2.237-2.231 4.166-4.087 5.571l6.571 4.819C40.636 37.134 44 32.221 44 26c0-1.341-.138-2.65-.389-3.917z" />
        </svg>
      )}
      Sign in with Google
    </Button>
  );
}

export function AuthForm() {
  return (
    <div className="space-y-6">
        <GoogleSignInButton />
        
        <div className="space-y-4">
            <div className="flex flex-col items-center text-center p-4">
                <p className="text-[10px] text-slate-500 dark:text-white/30 font-bold uppercase leading-relaxed tracking-wider">
                    Sign in to access your dashboard. All data is encrypted and secure.
                </p>
            </div>

            <div className="flex items-center justify-center gap-2 text-[9px] font-black uppercase tracking-[0.2em] text-slate-300 dark:text-white/10">
                <ShieldCheck className="h-3 w-3" />
                <span>Secure Authentication Node</span>
            </div>
        </div>
    </div>
  );
}
