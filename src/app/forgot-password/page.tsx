
'use client';

import { useState } from 'react';
import { useAuth } from '@/context/auth-provider';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, KeyRound, ArrowLeft } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import Link from 'next/link';
import { reportClientError } from '@/lib/report-client-error';

export default function ForgotPasswordPage() {
  const { sendPasswordReset } = useAuth();
  const { toast } = useToast();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

  const handlePasswordReset = async () => {
    if (!email) {
      toast({
        variant: 'destructive',
        title: 'Email Required',
        description: 'Please enter your email address.',
      });
      return;
    }
    setLoading(true);
    try {
      await sendPasswordReset(email);
      toast({
        title: 'Password Reset Email Sent',
        description: 'If an account exists for this email, you will receive instructions to reset your password.',
      });
      setEmailSent(true);
    } catch (error: any) {
            reportClientError('src/app/forgot-password/page.tsx:38', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message || 'Failed to send password reset email.',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md animate-in fade-in zoom-in-95 duration-500">
        <CardHeader className="items-center text-center">
          <KeyRound className="h-12 w-12 text-primary mb-4" />
          <CardTitle className="text-2xl">Forgot Your Password?</CardTitle>
          <CardDescription>
            {emailSent
              ? "Check your inbox (and spam folder) for the reset link."
              : "No problem. Enter your email address below and we'll send you a link to reset it."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {emailSent ? (
            <div className="text-center">
                <Button asChild>
                    <Link href="/login" prefetch={false}>
                        <ArrowLeft className="mr-2 h-4 w-4" /> Back to Login
                    </Link>
                </Button>
            </div>
          ) : (
            <>
              <div>
                <Label htmlFor="reset-email">Email Address</Label>
                <Input
                  id="reset-email"
                  type="email"
                  placeholder="user@gmail.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={loading}
                />
              </div>
              <Button onClick={handlePasswordReset} disabled={loading || !email} className="w-full">
                {loading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  'Send Reset Link'
                )}
              </Button>
               <Button variant="link" asChild className="w-full">
                <Link href="/login" prefetch={false}>
                    <ArrowLeft className="mr-2 h-4 w-4" /> Back to Login
                </Link>
               </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
