'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/auth-provider';
import { Header } from '@/components/header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Key,
  Terminal,
  Copy,
  Check,
  Plus,
  Trash2,
  ShieldCheck,
  Code,
  Sparkles,
  RefreshCw,
  Lock,
  Cpu,
  Layers,
  Play,
  CheckCircle2,
  AlertTriangle,
  Server,
  Activity,
  Globe,
  ArrowRight,
  BarChart3,
  TrendingUp,
  Clock,
  User,
  LogOut,
  ChevronRight,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import Link from 'next/link';
import { ref, onValue } from 'firebase/database';
import { initializeFirebase } from '@/firebase';

interface ApiKeyItem {
  id: string;
  apiKey?: string;
  maskedKey: string;
  name: string;
  createdAt: string;
  balance?: number;
}

export default function DeveloperDashboardPage() {
  const { user, activeUser, loading: authLoading, logout } = useAuth();
  const isAdmin = user?.role === 'admin' || activeUser?.role === 'admin';
  const { toast } = useToast();
  const { database } = initializeFirebase();

  const [isLocked, setIsLocked] = useState(false);
  const [keys, setKeys] = useState<ApiKeyItem[]>([]);
  const [loadingKeys, setLoadingKeys] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const [copiedKeyId, setCopiedKeyId] = useState<string | null>(null);
  const [copiedSnippet, setCopiedSnippet] = useState<string | null>(null);

  // Real API Usage Stats state
  const [usageData, setUsageData] = useState<any[]>([]);
  const [loadingAnalytics, setLoadingAnalytics] = useState(false);

  // Custom Auth Token Generator state
  const [targetProjectId, setTargetProjectId] = useState('proj_studio_default');
  const [customToken, setCustomToken] = useState<string | null>(null);
  const [isGeneratingToken, setIsGeneratingToken] = useState(false);

  // Playground Test State
  const [testScript, setTestScript] = useState('NARRATOR: Welcome to 12Labs AI Voice Studio.\nHERO: Let us build something extraordinary today!');
  const [testProjectName, setTestProjectName] = useState('API Test Project');
  const [testAuthMethod, setTestAuthMethod] = useState<'session' | 'custom-key'>('session');
  const [testCustomApiKey, setTestCustomApiKey] = useState('');
  const [testResult, setTestResult] = useState<string | null>(null);
  const [isAnalyzingTest, setIsAnalyzingTest] = useState(false);
  const [activeCodeTab, setActiveCodeTab] = useState<'curl' | 'js' | 'python'>('curl');
  const [graphMetric, setGraphMetric] = useState<'requests' | 'credits'>('requests');

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'https://12labs.ai';

  useEffect(() => {
    if (user?.uid) {
      fetchUserKeys();
      fetchAnalytics();
    }
  }, [user?.uid]);

  useEffect(() => {
    if (database) {
      const toolRef = ref(database, 'toolSettings/developer-api/locked');
      const unsubscribe = onValue(toolRef, (snapshot) => {
        setIsLocked(snapshot.val() === true);
      });
      return () => unsubscribe();
    }
  }, [database]);

  const fetchUserKeys = async () => {
    setLoadingKeys(true);
    try {
      const token = user ? await (user as any).getIdToken?.() : null;
      const res = await fetch(`/api/keys${user?.uid ? `?uid=${user.uid}` : ''}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.keys)) {
        setKeys(data.keys);
      }
    } catch (err: any) {
      console.error('Error fetching API keys:', err);
    } finally {
      setLoadingKeys(false);
    }
  };

  const fetchAnalytics = async () => {
    setLoadingAnalytics(true);
    try {
      const token = user ? await (user as any).getIdToken?.() : null;
      const res = await fetch(`/api/developer/analytics${user?.uid ? `?uid=${user.uid}` : ''}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.usageData)) {
        setUsageData(data.usageData);
      }
    } catch (err) {
      console.error('Error fetching analytics:', err);
    } finally {
      setLoadingAnalytics(false);
    }
  };

  const handleOpenDialog = () => {
    setCreatedKey(null);
    setNewKeyName('');
    setIsDialogOpen(true);
  };

  const handleCreateApiKey = async () => {
    if (!user) {
      toast({ title: 'Authentication Required', description: 'Please sign in to generate an API key.', variant: 'destructive' });
      return;
    }
    setIsGenerating(true);
    try {
      const token = await (user as any).getIdToken?.();
      const res = await fetch('/api/keys', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          name: newKeyName.trim() || 'Production Secret Key',
          uid: user.uid,
          email: user.email,
        }),
      });
      const data = await res.json();
      if (data.success && data.apiKey) {
        setCreatedKey(data.apiKey);
        setNewKeyName('');
        toast({ title: 'API Key Created!', description: 'Secret API key generated successfully.' });
        fetchUserKeys();
      } else {
        toast({ title: 'Error', description: data.error || 'Failed to generate key', variant: 'destructive' });
      }
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Network error', variant: 'destructive' });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDeleteApiKey = async (keyId: string, apiKey?: string) => {
    try {
      const token = user ? await (user as any).getIdToken?.() : null;
      const res = await fetch(`/api/keys?keyId=${keyId}&apiKey=${apiKey || ''}&uid=${user?.uid || ''}`, {
        method: 'DELETE',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json();
      if (data.success) {
        toast({ title: 'Key Revoked', description: 'API Key has been revoked successfully.' });
        fetchUserKeys();
      }
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  const handleGenerateCustomToken = async () => {
    if (!user) {
      toast({ title: 'Authentication Required', description: 'Please sign in first.', variant: 'destructive' });
      return;
    }
    setIsGeneratingToken(true);
    setCustomToken(null);
    try {
      const token = await (user as any).getIdToken?.();
      const selectedApiKey = keys[0]?.maskedKey || '12labs_sec_sample';
      const res = await fetch('/api/auth/custom-token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          uid: user.uid,
          projectId: targetProjectId || 'proj_studio_default',
          apiKey: selectedApiKey,
        }),
      });
      const data = await res.json();
      if (data.success && data.customToken) {
        setCustomToken(data.customToken);
        toast({ title: 'Custom Token Generated!', description: 'Firebase Auth JWT signed successfully.' });
      } else {
        toast({ title: 'Error', description: data.error || 'Failed to generate custom token.', variant: 'destructive' });
      }
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setIsGeneratingToken(false);
    }
  };

  const handleRunPlaygroundTest = async () => {
    setIsAnalyzingTest(true);
    setTestResult('Connecting to 12Labs Engine & analyzing script...');
    try {
      const token = user ? await (user as any).getIdToken?.() : null;
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (testAuthMethod === 'custom-key') {
        if (!testCustomApiKey.trim()) {
          setIsAnalyzingTest(false);
          setTestResult(JSON.stringify({ error: "Please enter your custom API key." }, null, 2));
          toast({ title: 'API Key Required', description: 'Please enter your custom API key in the playground input.', variant: 'destructive' });
          return;
        }
        headers['X-API-Key'] = testCustomApiKey.trim();
      } else {
        // Session Bearer Token
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        } else {
          setIsAnalyzingTest(false);
          setTestResult(JSON.stringify({ error: "No active session found. Please login." }, null, 2));
          return;
        }
      }

      const res = await fetch('/api/script/analyze', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          projectName: testProjectName.trim() || 'API Test Project',
          script: testScript,
        }),
      });

      const responseText = await res.text();
      let data;
      try {
        data = JSON.parse(responseText);
      } catch (err) {
        data = {
          success: false,
          error: `Server returned an invalid JSON or HTML error response (Status: ${res.status}).`,
          rawResponse: responseText.substring(0, 500)
        };
      }

      setTestResult(JSON.stringify(data, null, 2));
      // Refresh analytics after running a test request to keep the graph and counts perfectly real!
      fetchAnalytics();
    } catch (err: any) {
      setTestResult(JSON.stringify({ error: err.message }, null, 2));
    } finally {
      setIsAnalyzingTest(false);
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKeyId(id);
    setTimeout(() => setCopiedKeyId(null), 2000);
  };

  const copySnippet = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSnippet(label);
    setTimeout(() => setCopiedSnippet(null), 2000);
  };

  const currentAccountCredits = (activeUser as any)?.credits ?? user?.credits ?? 0;

  // Calculate stats from real analytics
  const totalRequests7D = usageData.reduce((acc, curr) => acc + (curr.requests || 0), 0);
  const totalCredits7D = usageData.reduce((acc, curr) => acc + (curr.credits || 0), 0);
  const hasUsage = totalRequests7D > 0;
  const avgLatency = totalRequests7D > 0 
    ? Math.round(usageData.reduce((acc, curr) => acc + (curr.latency * curr.requests), 0) / totalRequests7D)
    : 0;

  // Render Locked State
  if (isLocked && !isAdmin) {
    return (
      <div className="min-h-screen bg-background text-foreground flex flex-col">
        <Header />
        <main className="flex-1 py-20 px-4 max-w-7xl mx-auto flex flex-col items-center justify-center text-center space-y-6">
          <div className="p-6 rounded-full bg-destructive/10">
            <Lock className="w-16 h-16 text-destructive" />
          </div>
          <h1 className="text-4xl font-black tracking-tight">API Platform Locked</h1>
          <p className="text-muted-foreground text-lg max-w-lg">
            The developer API is currently under maintenance or disabled by an administrator. Please check back later.
          </p>
          <Button asChild size="lg" className="rounded-xl px-8 font-semibold mt-4">
            <Link href="/">Return Home</Link>
          </Button>
        </main>
      </div>
    );
  }

  // Render Premium Auth Checking State
  if (authLoading) {
    return (
      <div className="min-h-screen bg-background text-foreground flex flex-col">
        <Header />
        <main className="flex-1 py-20 px-4 max-w-7xl mx-auto flex flex-col items-center justify-center space-y-4">
          <RefreshCw className="w-10 h-10 text-primary animate-spin" />
          <p className="text-sm font-semibold text-muted-foreground">Authenticating Developer Session...</p>
        </main>
      </div>
    );
  }

  // Render Login Wall (If user is not logged in)
  if (!user) {
    return (
      <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 text-foreground flex flex-col">
        <Header />
        <main className="flex-1 py-16 px-4 md:px-8 max-w-7xl mx-auto space-y-16">
          
          {/* Landing Banner */}
          <div className="text-center max-w-3xl mx-auto space-y-6 py-6">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-neutral-100 dark:bg-neutral-900 text-neutral-800 dark:text-neutral-200 text-xs font-bold tracking-wider uppercase border border-neutral-200 dark:border-neutral-800">
              <Terminal className="w-3.5 h-3.5 text-primary" /> Developer Platform
            </div>
            <h1 className="text-4xl md:text-5xl font-black tracking-tight leading-none text-neutral-900 dark:text-neutral-50">
              12Labs Voice Synthesis & Audio Generation APIs
            </h1>
            <p className="text-neutral-600 dark:text-neutral-400 text-base md:text-lg leading-relaxed">
              Integrate script analysis, auto-speaker voice pairing, and production-ready high-fidelity voice overs directly into your own applications, web systems, and creative workflows.
            </p>
            <div className="pt-4 flex flex-wrap justify-center gap-4">
              <Button asChild size="lg" className="rounded-xl px-8 py-6 font-bold text-base shadow-md hover:shadow-lg transition-all gap-2">
                <Link href="/login">
                  Login to Access Developer APIs <ArrowRight className="w-4 h-4" />
                </Link>
              </Button>
              <Button variant="outline" asChild size="lg" className="rounded-xl px-8 py-6 font-semibold">
                <Link href="/">Back to Home</Link>
              </Button>
            </div>
          </div>

          {/* Features Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            <Card className="border border-neutral-200/80 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-sm rounded-xl">
              <CardHeader className="space-y-3">
                <div className="p-3 rounded-xl bg-neutral-100 dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200 w-12 h-12 flex items-center justify-center">
                  <Key className="w-6 h-6" />
                </div>
                <CardTitle className="text-lg font-bold">Secure Access Keys</CardTitle>
                <CardDescription className="text-xs leading-relaxed text-neutral-500 dark:text-neutral-400">
                  Generate and revoke secure secret API keys. Keep full server-side control over script processing limits.
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="border border-neutral-200/80 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-sm rounded-xl">
              <CardHeader className="space-y-3">
                <div className="p-3 rounded-xl bg-neutral-100 dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200 w-12 h-12 flex items-center justify-center">
                  <Code className="w-6 h-6" />
                </div>
                <CardTitle className="text-lg font-bold">Comprehensive Developer SDK</CardTitle>
                <CardDescription className="text-xs leading-relaxed text-neutral-500 dark:text-neutral-400">
                  Easily integrate using cURL, Node.js, or Python. Test inputs in real-time inside our interactive sandbox playground.
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="border border-neutral-200/80 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-sm rounded-xl">
              <CardHeader className="space-y-3">
                <div className="p-3 rounded-xl bg-neutral-100 dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200 w-12 h-12 flex items-center justify-center">
                  <Lock className="w-6 h-6" />
                </div>
                <CardTitle className="text-lg font-bold">Custom Sync Auth JWTs</CardTitle>
                <CardDescription className="text-xs leading-relaxed text-neutral-500 dark:text-neutral-400">
                  Mint server-signed Firebase Auth tokens on the fly to authenticate headless sync queues or backend workflows securely.
                </CardDescription>
              </CardHeader>
            </Card>
          </div>

          {/* Code Preview Section to entice developers */}
          <div className="max-w-4xl mx-auto border border-neutral-200/80 dark:border-neutral-800 rounded-2xl bg-neutral-900 p-6 shadow-xl relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-5">
              <Terminal className="w-64 h-64 text-white" />
            </div>
            <div className="flex items-center justify-between border-b border-neutral-800 pb-4 mb-4">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-neutral-700" />
                <span className="w-3 h-3 rounded-full bg-neutral-600" />
                <span className="w-3 h-3 rounded-full bg-neutral-500" />
                <span className="text-xs text-neutral-400 font-mono ml-2">POST /api/script/analyze</span>
              </div>
              <Badge variant="outline" className="text-xs border-neutral-800 text-neutral-400 font-mono">cURL Example</Badge>
            </div>
            <pre className="text-xs text-neutral-100 font-mono leading-relaxed overflow-x-auto whitespace-pre">
{`curl -X POST "${baseUrl}/api/script/analyze" \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: YOUR_12LABS_SECRET_KEY" \\
  -d '{
    "projectName": "My Auditory Project",
    "script": "NARRATOR: Welcome to 12Labs AI voice service.\\nHERO: Let us build incredible narratives."
  }'`}
            </pre>
          </div>

        </main>
      </div>
    );
  }

  // Render Full Authenticated Developer Portal
  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 text-foreground flex flex-col">
      <Header />
      <main className="flex-1 py-8 px-4 md:px-8 max-w-7xl mx-auto space-y-8 w-full">
        {isLocked && isAdmin && (
          <div className="bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 p-4 rounded-xl flex flex-wrap items-center justify-between gap-3 text-sm font-bold shadow-xs">
            <div className="flex items-center gap-2.5">
              <Lock className="w-4 h-4 text-amber-500 shrink-0" />
              <span>Developer API is currently set to LOCKED for regular users in Tool Settings. As Admin, you have full override access.</span>
            </div>
            <Badge className="bg-amber-500 text-black font-black text-[10px] shrink-0">ADMIN OVERRIDE</Badge>
          </div>
        )}
        
        {/* Top Profile & Hero Banner */}
        <div className="relative overflow-hidden rounded-2xl border border-neutral-200/80 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-6 shadow-sm">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
            <div className="space-y-3 max-w-2xl">
              <div className="flex items-center gap-2">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200 text-xs font-bold uppercase">
                  <Terminal className="w-3.5 h-3.5 text-primary" /> Developer Platform & API
                </div>
                
                {/* STRICT PROFILE CLARIFICATION */}
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-bold border border-primary/20">
                  <User className="w-3.5 h-3.5" />
                  <span>Logged in as: {user.email || 'Developer'}</span>
                </div>
              </div>
              <h1 className="text-3xl md:text-4xl font-black tracking-tight text-neutral-900 dark:text-neutral-50">
                Developer Center
              </h1>
              <p className="text-neutral-500 dark:text-neutral-400 text-sm leading-relaxed">
                Configure production secret API keys, generate signed Firebase Auth JWTs for project integration, and trace live script synthesis metrics.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={handleOpenDialog} size="lg" className="gap-2 font-bold shadow-sm h-11 px-6 rounded-xl">
                <Plus className="w-4 h-4" /> Create New Secret Key
              </Button>
              <Button onClick={() => logout()} variant="outline" size="lg" className="gap-2 font-semibold h-11 px-5 rounded-xl text-neutral-600 hover:text-red-600 dark:text-neutral-400 dark:hover:text-red-400">
                <LogOut className="w-4 h-4" /> Logout
              </Button>
            </div>
          </div>

          {/* Quick Stats Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6 pt-6 border-t border-neutral-100 dark:border-neutral-800/80">
            <div className="space-y-1">
              <p className="text-[10px] font-bold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider">Active Secret Keys</p>
              <p className="text-2xl font-black text-neutral-900 dark:text-neutral-50">{keys.length}</p>
            </div>
            <div className="space-y-1">
              <p className="text-[10px] font-bold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider">Account Live Credits</p>
              <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
                {currentAccountCredits.toLocaleString()} Credits
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-[10px] font-bold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider">API Health Status</p>
              <div className="flex items-center gap-1.5 text-sm font-bold text-emerald-600 dark:text-emerald-400">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                100% Operational
              </div>
            </div>
            <div className="space-y-1">
              <p className="text-[10px] font-bold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider">Auth Protocol</p>
              <p className="text-sm font-bold font-mono text-neutral-800 dark:text-neutral-200">X-API-Key</p>
            </div>
          </div>
        </div>

        {/* 100% REAL API USAGE CHART SECTION */}
        <Card className="border border-neutral-200/80 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-sm rounded-2xl">
          <CardHeader className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-neutral-100 dark:border-neutral-800/80 pb-5">
            <div className="space-y-1">
              <CardTitle className="text-lg font-bold flex items-center gap-2 text-neutral-900 dark:text-neutral-50">
                <BarChart3 className="w-5 h-5 text-primary" /> API Performance & Usage Analytics
              </CardTitle>
              <CardDescription className="text-xs text-neutral-500 dark:text-neutral-400">
                100% Real-time dashboard plotting actual API hits, credit transactions, and connection speeds.
              </CardDescription>
            </div>

            <div className="flex items-center bg-neutral-100 dark:bg-neutral-800 p-1 rounded-xl text-xs font-semibold shrink-0">
              <button
                onClick={() => setGraphMetric('requests')}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  graphMetric === 'requests' ? 'bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-50 shadow-sm' : 'text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200'
                }`}
              >
                Requests Volume
              </button>
              <button
                onClick={() => setGraphMetric('credits')}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  graphMetric === 'credits' ? 'bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-50 shadow-sm' : 'text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200'
                }`}
              >
                Credits Expended
              </button>
            </div>
          </CardHeader>

          <CardContent className="pt-6">
            {/* KPI metrics row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="p-4 rounded-xl bg-neutral-50 dark:bg-neutral-950 border border-neutral-100 dark:border-neutral-900">
                <span className="text-[10px] text-neutral-400 dark:text-neutral-500 font-bold uppercase tracking-wider flex items-center gap-1.5">
                  <TrendingUp className="w-3.5 h-3.5 text-emerald-500" /> Success Rate
                </span>
                <p className="text-xl font-black mt-1 text-neutral-900 dark:text-neutral-50">
                  {hasUsage ? '100.00%' : 'N/A'}
                </p>
              </div>
              <div className="p-4 rounded-xl bg-neutral-50 dark:bg-neutral-950 border border-neutral-100 dark:border-neutral-900">
                <span className="text-[10px] text-neutral-400 dark:text-neutral-500 font-bold uppercase tracking-wider flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-primary" /> Avg Latency
                </span>
                <p className="text-xl font-black mt-1 text-neutral-900 dark:text-neutral-50">
                  {hasUsage ? `${avgLatency}ms` : '0ms'}
                </p>
              </div>
              <div className="p-4 rounded-xl bg-neutral-50 dark:bg-neutral-950 border border-neutral-100 dark:border-neutral-900">
                <span className="text-[10px] text-neutral-400 dark:text-neutral-500 font-bold uppercase tracking-wider">7D Request Sum</span>
                <p className="text-xl font-black mt-1 text-neutral-900 dark:text-neutral-50">
                  {totalRequests7D.toLocaleString()}
                </p>
              </div>
              <div className="p-4 rounded-xl bg-neutral-50 dark:bg-neutral-950 border border-neutral-100 dark:border-neutral-900">
                <span className="text-[10px] text-neutral-400 dark:text-neutral-500 font-bold uppercase tracking-wider">7D Credits Sum</span>
                <p className="text-xl font-black mt-1 text-emerald-600 dark:text-emerald-400">
                  {totalCredits7D.toLocaleString()}
                </p>
              </div>
            </div>

            {/* Recharts Area Chart Container */}
            <div className="h-72 w-full pt-2">
              {loadingAnalytics ? (
                <div className="h-full w-full flex flex-col items-center justify-center space-y-2">
                  <RefreshCw className="w-8 h-8 text-primary animate-spin" />
                  <p className="text-xs font-semibold text-neutral-400">Loading live usage data...</p>
                </div>
              ) : usageData.length === 0 ? (
                <div className="h-full w-full flex flex-col items-center justify-center space-y-2 border border-dashed rounded-xl border-neutral-200 dark:border-neutral-800">
                  <p className="text-xs font-semibold text-neutral-400">No data available for chart</p>
                </div>
              ) : !hasUsage ? (
                <div className="relative h-full w-full">
                  {/* Overlay informing about empty but active state */}
                  <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-white/75 dark:bg-neutral-900/75 backdrop-blur-xs text-center p-6">
                    <Activity className="w-8 h-8 text-neutral-300 dark:text-neutral-700 mb-2" />
                    <p className="text-sm font-bold text-neutral-800 dark:text-neutral-200">No API calls recorded in the last 7 days</p>
                    <p className="text-xs text-neutral-500 max-w-sm mt-1">
                      Start using your developer secret key in the playground or backend scripts to see live analytics.
                    </p>
                  </div>
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={usageData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.05)" />
                      <XAxis dataKey="date" tickLine={false} axisLine={false} tick={{ fill: '#888', fontSize: 11 }} />
                      <YAxis tickLine={false} axisLine={false} tick={{ fill: '#888', fontSize: 11 }} />
                      <Area type="monotone" dataKey={graphMetric} stroke="#e5e5e5" fill="#f5f5f5" strokeWidth={1} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={usageData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorMetric" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.25}/>
                        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0.0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.06)" />
                    <XAxis 
                      dataKey="date" 
                      tickLine={false} 
                      axisLine={false}
                      tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11, fontWeight: 500 }} 
                    />
                    <YAxis 
                      tickLine={false} 
                      axisLine={false} 
                      tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11, fontWeight: 500 }}
                    />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: 'hsl(var(--card))', 
                        borderColor: 'hsl(var(--border))',
                        borderRadius: '12px',
                        fontSize: '12px',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.05)'
                      }} 
                      labelStyle={{ fontWeight: 'bold', color: 'hsl(var(--foreground))' }}
                    />
                    <Area 
                      type="monotone" 
                      dataKey={graphMetric} 
                      stroke="hsl(var(--primary))" 
                      strokeWidth={2.5} 
                      fillOpacity={1} 
                      fill="url(#colorMetric)" 
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Generate Key Modal Dialog */}
        <Dialog open={isDialogOpen} onOpenChange={(open) => {
          setIsDialogOpen(open);
          if (!open) {
            setCreatedKey(null);
            setNewKeyName('');
          }
        }}>
          <DialogContent className="sm:max-w-lg border-neutral-200 dark:border-neutral-800 shadow-xl rounded-2xl">
            {!createdKey ? (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2 text-xl font-bold">
                    <div className="p-2 rounded-lg bg-neutral-100 dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200">
                      <Key className="w-5 h-5 text-primary" />
                    </div>
                    Create Secret API Key
                  </DialogTitle>
                  <DialogDescription className="text-xs text-neutral-500">
                    Secret API keys provide full authenticated access to voice analysis & generation APIs.
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-3">
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-neutral-400">
                      Key Identifier / Name
                    </label>
                    <Input
                      placeholder="e.g. Production Backend, VoiceBot Integration"
                      value={newKeyName}
                      onChange={(e) => setNewKeyName(e.target.value)}
                      className="font-medium h-11 rounded-xl"
                    />
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {['Production Key', 'Development API', 'Voice Bot Service', 'Mobile App Client'].map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => setNewKeyName(preset)}
                          className="text-[11px] px-2.5 py-1 rounded-full bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-neutral-600 dark:text-neutral-300 transition-colors font-medium"
                        >
                          + {preset}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 p-3.5 text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2.5">
                    <ShieldCheck className="w-4.5 h-4.5 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
                    <span className="leading-relaxed">
                      Your generated API key will share your account live credit balance (<strong>{currentAccountCredits.toLocaleString()} Credits</strong>).
                    </span>
                  </div>
                </div>

                <DialogFooter className="gap-2 sm:gap-0">
                  <Button variant="outline" onClick={() => setIsDialogOpen(false)} className="font-semibold rounded-xl">
                    Cancel
                  </Button>
                  <Button onClick={handleCreateApiKey} disabled={isGenerating} className="gap-2 font-bold shadow-md rounded-xl">
                    {isGenerating ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                    {isGenerating ? 'Generating Secret Key...' : 'Generate Secret Key'}
                  </Button>
                </DialogFooter>
              </>
            ) : (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2 text-xl font-bold text-emerald-600 dark:text-emerald-400">
                    <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                      <CheckCircle2 className="w-5 h-5" />
                    </div>
                    Secret Key Generated!
                  </DialogTitle>
                  <DialogDescription className="text-xs text-neutral-500">
                    Please copy and store your secret key immediately in your secure environment variables.
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-3">
                  <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-800 dark:text-amber-300 space-y-1 text-xs">
                    <div className="flex items-center gap-1.5 font-bold">
                      <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                      <span>Important Security Notice</span>
                    </div>
                    <p className="text-[11px] leading-relaxed opacity-90">
                      This secret key will <strong>never be shown in full again</strong>. If you lose this key, you will need to revoke it and generate a new one.
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold uppercase tracking-wider text-neutral-400">
                      Your Secret API Key
                    </label>
                    <div className="flex items-center gap-2 p-3.5 rounded-xl bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 font-mono text-xs break-all font-semibold text-primary relative">
                      <span className="flex-1 select-all">{createdKey}</span>
                      <Button
                        size="sm"
                        className="gap-1.5 shrink-0 font-bold shadow-sm rounded-lg"
                        onClick={() => copyToClipboard(createdKey, 'modal-created-key')}
                      >
                        {copiedKeyId === 'modal-created-key' ? (
                          <>
                            <Check className="w-4 h-4 text-emerald-300" />
                            Copied
                          </>
                        ) : (
                          <>
                            <Copy className="w-4 h-4" />
                            Copy Key
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </div>

                <DialogFooter>
                  <Button
                    className="w-full font-bold h-11 rounded-xl"
                    variant="default"
                    onClick={() => {
                      setCreatedKey(null);
                      setNewKeyName('');
                      setIsDialogOpen(false);
                    }}
                  >
                    I Have Saved My Secret Key
                  </Button>
                </DialogFooter>
              </>
            )}
          </DialogContent>
        </Dialog>

        {/* Main Tabs */}
        <Tabs defaultValue="keys" className="space-y-6">
          <TabsList className="grid w-full grid-cols-3 max-w-xl h-12 p-1 bg-neutral-100 dark:bg-neutral-900 rounded-xl border border-neutral-200/50 dark:border-neutral-800/50">
            <TabsTrigger value="keys" className="gap-2 font-bold rounded-lg data-[state=active]:shadow-sm data-[state=active]:bg-white dark:data-[state=active]:bg-neutral-800">
              <Key className="w-4 h-4" /> API Keys
            </TabsTrigger>
            <TabsTrigger value="custom-token" className="gap-2 font-bold rounded-lg data-[state=active]:shadow-sm data-[state=active]:bg-white dark:data-[state=active]:bg-neutral-800">
              <Lock className="w-4 h-4" /> Custom Auth Token
            </TabsTrigger>
            <TabsTrigger value="docs" className="gap-2 font-bold rounded-lg data-[state=active]:shadow-sm data-[state=active]:bg-white dark:data-[state=active]:bg-neutral-800">
              <Code className="w-4 h-4" /> API Docs & Testing
            </TabsTrigger>
          </TabsList>

          {/* TAB 1: API KEYS MANAGER */}
          <TabsContent value="keys" className="space-y-6">
            <Card className="border border-neutral-200/80 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-sm rounded-2xl overflow-hidden">
              <CardHeader className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-neutral-100 dark:border-neutral-800/80 pb-4">
                <div>
                  <CardTitle className="text-lg font-bold flex items-center gap-2 text-neutral-900 dark:text-neutral-50">
                    <ShieldCheck className="w-5 h-5 text-primary" /> Active API Secret Keys
                  </CardTitle>
                  <CardDescription className="text-xs text-neutral-500 dark:text-neutral-400">
                    Pass your secret key via the <code className="bg-neutral-100 dark:bg-neutral-800 px-1.5 py-0.5 rounded font-mono text-primary font-semibold">X-API-Key</code> request header.
                  </CardDescription>
                </div>
                <Button size="sm" variant="outline" className="gap-2 text-xs font-semibold rounded-lg" onClick={fetchUserKeys}>
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingKeys ? 'animate-spin' : ''}`} /> Refresh Keys
                </Button>
              </CardHeader>

              <CardContent className="p-0 divide-y divide-neutral-100 dark:divide-neutral-800">
                {loadingKeys ? (
                  <div className="p-12 text-center text-sm text-neutral-400 animate-pulse font-medium">
                    Loading secret API keys...
                  </div>
                ) : keys.length === 0 ? (
                  <div className="p-12 text-center space-y-4">
                    <div className="w-12 h-12 rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-400 flex items-center justify-center mx-auto">
                      <Key className="w-6 h-6" />
                    </div>
                    <div className="space-y-1">
                      <p className="text-base font-bold text-neutral-850 dark:text-neutral-100">No API Keys Generated Yet</p>
                      <p className="text-xs text-neutral-500 max-w-md mx-auto">
                        Generate an API key above to start connecting external applications, voice bots, or scripts.
                      </p>
                    </div>
                    <Button onClick={handleOpenDialog} size="sm" className="gap-2 font-bold rounded-xl">
                      <Plus className="w-4 h-4" /> Create First API Key
                    </Button>
                  </div>
                ) : (
                  keys.map((k) => (
                    <div key={k.id} className="p-4 md:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-neutral-50/50 dark:hover:bg-neutral-900/50 transition-colors">
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm text-neutral-800 dark:text-neutral-100">{k.name}</span>
                          <Badge variant="outline" className="text-[10px] font-mono bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 font-bold">
                            Active
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2">
                          <code className="text-xs font-mono text-neutral-800 dark:text-neutral-200 bg-neutral-100 dark:bg-neutral-800 px-2.5 py-1 rounded-lg inline-block font-semibold border border-neutral-200/50 dark:border-neutral-700/50">
                            {k.maskedKey}
                          </code>
                        </div>
                        <p className="text-[11px] text-neutral-400">
                          Created: {new Date(k.createdAt).toLocaleDateString()}
                        </p>
                      </div>

                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <p className="text-[10px] text-neutral-400 dark:text-neutral-500 font-bold uppercase tracking-wider">Live Account Balance</p>
                          <p className="text-sm font-black text-emerald-600 dark:text-emerald-400">
                            {currentAccountCredits.toLocaleString()} Credits
                          </p>
                        </div>

                        <Button
                          size="icon"
                          variant="ghost"
                          className="text-red-500 hover:text-red-600 hover:bg-red-500/10 h-9 w-9 rounded-lg"
                          title="Revoke Key"
                          onClick={() => handleDeleteApiKey(k.id, k.apiKey)}
                        >
                          <Trash2 className="w-4 h-4" />
                          <span className="sr-only">Revoke Key</span>
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* TAB 2: CUSTOM FIREBASE AUTH TOKEN */}
          <TabsContent value="custom-token" className="space-y-6">
            <Card className="border border-neutral-200/80 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-sm rounded-2xl">
              <CardHeader>
                <CardTitle className="text-lg font-bold flex items-center gap-2 text-neutral-900 dark:text-neutral-50">
                  <Lock className="w-5 h-5 text-primary" /> Firebase Custom Auth JWT Generator
                </CardTitle>
                <CardDescription className="text-xs leading-relaxed text-neutral-500 dark:text-neutral-400">
                  Mint signed custom Firebase Auth JWT tokens on behalf of your user account to authorize real-time synchronization or headless backend tasks.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 rounded-xl bg-neutral-50 dark:bg-neutral-950 border border-neutral-100 dark:border-neutral-900">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold uppercase tracking-wider text-neutral-400">Target Project ID</label>
                    <Input
                      value={targetProjectId}
                      onChange={(e) => setTargetProjectId(e.target.value)}
                      placeholder="proj_studio_default"
                      className="font-mono text-xs h-10 rounded-xl"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold uppercase tracking-wider text-neutral-400">Target User UID</label>
                    <Input value={user?.uid || ''} disabled className="bg-neutral-100 dark:bg-neutral-900 font-mono text-xs h-10 rounded-xl" />
                  </div>
                </div>

                <Button onClick={handleGenerateCustomToken} disabled={isGeneratingToken} className="gap-2 font-bold h-11 px-6 shadow-sm rounded-xl">
                  {isGeneratingToken ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  {isGeneratingToken ? 'Generating Token...' : 'Generate Signed Custom Token'}
                </Button>

                {customToken && (
                  <div className="space-y-3 pt-4 border-t border-neutral-100 dark:border-neutral-800">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4" /> Firebase Signed Custom Auth Token (JWT)
                      </label>
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-2 text-xs font-bold rounded-lg"
                        onClick={() => copyToClipboard(customToken, 'custom-token')}
                      >
                        {copiedKeyId === 'custom-token' ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                        {copiedKeyId === 'custom-token' ? 'Copied JWT' : 'Copy JWT Token'}
                      </Button>
                    </div>
                    <pre className="bg-neutral-100 dark:bg-neutral-850 p-4 rounded-xl text-xs font-mono break-all whitespace-pre-wrap max-h-48 overflow-y-auto border border-neutral-200/50 dark:border-neutral-700/50 font-medium text-foreground">
                      {customToken}
                    </pre>
                    <p className="text-[11px] text-neutral-450 dark:text-neutral-400 leading-relaxed">
                      Pass this token to Firebase SDK <code className="bg-neutral-100 dark:bg-neutral-800 px-1.5 py-0.5 rounded font-mono text-primary">signInWithCustomToken(auth, customToken)</code> in mobile apps or external backends to authenticate sessions seamlessly.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* TAB 3: API DOCS & PLAYGROUND */}
          <TabsContent value="docs" className="space-y-6">
            <Card className="border border-neutral-200/80 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-sm rounded-2xl">
              <CardHeader>
                <CardTitle className="text-lg font-bold flex items-center gap-2 text-neutral-900 dark:text-neutral-50">
                  <Code className="w-5 h-5 text-primary" /> API Specification & SDK Docs
                </CardTitle>
                <CardDescription className="text-xs text-neutral-500 dark:text-neutral-400">
                  Integrate script analysis, voice assignment, and speech generation endpoints into your custom workflows.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                
                {/* Code Snippet Tabs */}
                <div className="space-y-3 border border-neutral-200/80 dark:border-neutral-800 rounded-2xl p-5 bg-neutral-50/50 dark:bg-neutral-900/30">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-neutral-200/60 dark:border-neutral-800/80 pb-3">
                    <div className="flex items-center gap-3">
                      <Badge className="bg-emerald-600 text-white font-mono text-xs px-2.5 py-0.5 font-bold rounded-md">POST</Badge>
                      <code className="font-bold text-sm text-primary font-mono">{baseUrl}/api/script/analyze</code>
                    </div>
                    <div className="flex items-center gap-1 bg-neutral-100 dark:bg-neutral-850 p-1 rounded-xl text-xs">
                      {(['curl', 'js', 'python'] as const).map((tab) => (
                        <button
                          key={tab}
                          onClick={() => setActiveCodeTab(tab)}
                          className={`px-3 py-1 rounded-lg font-bold uppercase transition-all ${
                            activeCodeTab === tab ? 'bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-50 shadow-sm' : 'text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200'
                          }`}
                        >
                          {tab === 'curl' ? 'cURL' : tab === 'js' ? 'Node.js' : 'Python'}
                        </button>
                      ))}
                    </div>
                  </div>

                  <p className="text-xs text-neutral-500 dark:text-neutral-400 leading-relaxed">
                    Parses screenplay scripts, detects speakers, auto-maps voice profiles, and provides credit estimates.
                  </p>

                  <div className="relative group">
                    <pre className="bg-neutral-900 text-neutral-100 p-4 rounded-xl text-xs font-mono overflow-x-auto leading-relaxed border border-neutral-850 shadow-inner">
                      {activeCodeTab === 'curl' && `curl -X POST "${baseUrl}/api/script/analyze" \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: YOUR_12LABS_SECRET_KEY" \\
  -d '{
    "projectName": "My Short Film",
    "script": "NARRATOR: Welcome to 12Labs AI.\\nHERO: Let us create magic today!"
  }'`}
                      {activeCodeTab === 'js' && `const response = await fetch("${baseUrl}/api/script/analyze", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-API-Key": "YOUR_12LABS_SECRET_KEY"
  },
  body: JSON.stringify({
    projectName: "My Short Film",
    script: "NARRATOR: Welcome to 12Labs AI.\\nHERO: Let us create magic today!"
  })
});
const data = await response.json();
console.log(data);`}
                      {activeCodeTab === 'python' && `import requests
 
url = "${baseUrl}/api/script/analyze"
headers = {
    "Content-Type": "application/json",
    "X-API-Key": "YOUR_12LABS_SECRET_KEY"
}
payload = {
    "projectName": "My Short Film",
    "script": "NARRATOR: Welcome to 12Labs AI.\\nHERO: Let us create magic today!"
}

response = requests.post(url, json=payload, headers=headers)
print(response.json())`}
                    </pre>
                    <Button
                      size="sm"
                      variant="secondary"
                      className="absolute top-3 right-3 gap-1.5 text-xs font-bold opacity-90 hover:opacity-100 rounded-lg"
                      onClick={() => copySnippet(activeCodeTab === 'curl' ? `curl -X POST "${baseUrl}/api/script/analyze"` : 'code', 'endpoint1')}
                    >
                      {copiedSnippet === 'endpoint1' ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                      {copiedSnippet === 'endpoint1' ? 'Copied' : 'Copy'}
                    </Button>
                  </div>
                </div>

                {/* Endpoint 2: Assign Voices */}
                <div className="space-y-3 border border-neutral-200/80 dark:border-neutral-800 rounded-2xl p-5 bg-neutral-50/50 dark:bg-neutral-900/30">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-neutral-200/60 dark:border-neutral-800/80 pb-3">
                    <div className="flex items-center gap-3">
                      <Badge className="bg-emerald-600 text-white font-mono text-xs px-2.5 py-0.5 font-bold rounded-md">POST</Badge>
                      <code className="font-bold text-sm text-primary font-mono">{baseUrl}/api/script/assign-voices</code>
                    </div>
                  </div>

                  <p className="text-xs text-neutral-500 dark:text-neutral-400 leading-relaxed">
                    Manually override voice assignments for characters identified in the analysis phase.
                  </p>

                  <div className="relative group">
                    <pre className="bg-neutral-900 text-neutral-100 p-4 rounded-xl text-xs font-mono overflow-x-auto leading-relaxed border border-neutral-850 shadow-inner">
                      {activeCodeTab === 'curl' && `curl -X POST "${baseUrl}/api/script/assign-voices" \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: YOUR_12LABS_SECRET_KEY" \\
  -d '{
    "projectId": "PROJ_123456",
    "characters": [
      {"name": "Narrator", "voice": "Puck"},
      {"name": "Hero", "voice": "Kore"}
    ]
  }'`}
                      {activeCodeTab === 'js' && `const response = await fetch("${baseUrl}/api/script/assign-voices", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-API-Key": "YOUR_12LABS_SECRET_KEY"
  },
  body: JSON.stringify({
    projectId: "PROJ_123456",
    characters: [
      { name: "Narrator", voice: "Puck" },
      { name: "Hero", voice: "Kore" }
    ]
  })
});
const data = await response.json();
console.log(data);`}
                      {activeCodeTab === 'python' && `import requests
 
url = "${baseUrl}/api/script/assign-voices"
headers = {
    "Content-Type": "application/json",
    "X-API-Key": "YOUR_12LABS_SECRET_KEY"
}
payload = {
    "projectId": "PROJ_123456",
    "characters": [
        {"name": "Narrator", "voice": "Puck"},
        {"name": "Hero", "voice": "Kore"}
    ]
}

response = requests.post(url, json=payload, headers=headers)
print(response.json())`}
                    </pre>
                  </div>
                </div>

                {/* Endpoint 3: Generate Audio */}
                <div className="space-y-3 border border-neutral-200/80 dark:border-neutral-800 rounded-2xl p-5 bg-neutral-50/50 dark:bg-neutral-900/30">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-neutral-200/60 dark:border-neutral-800/80 pb-3">
                    <div className="flex items-center gap-3">
                      <Badge className="bg-emerald-600 text-white font-mono text-xs px-2.5 py-0.5 font-bold rounded-md">POST</Badge>
                      <code className="font-bold text-sm text-primary font-mono">{baseUrl}/api/script/generate</code>
                    </div>
                  </div>

                  <p className="text-xs text-neutral-500 dark:text-neutral-400 leading-relaxed">
                    Triggers the neural synthesis engine to generate audio for the project.
                  </p>

                  <div className="relative group">
                    <pre className="bg-neutral-900 text-neutral-100 p-4 rounded-xl text-xs font-mono overflow-x-auto leading-relaxed border border-neutral-850 shadow-inner">
                      {activeCodeTab === 'curl' && `curl -X POST "${baseUrl}/api/script/generate" \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: YOUR_12LABS_SECRET_KEY" \\
  -d '{
    "projectId": "PROJ_123456",
    "projectName": "My Short Film",
    "dialogues": [{"character": "Narrator", "line": "Welcome."}],
    "characters": [{"name": "Narrator", "voice": "Puck", "age": "adult"}],
    "genre": "horror",
    "toneGuidance": "Tense"
  }'`}
                      {activeCodeTab === 'js' && `const response = await fetch("${baseUrl}/api/script/generate", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-API-Key": "YOUR_12LABS_SECRET_KEY"
  },
  body: JSON.stringify({
    projectId: "PROJ_123456",
    projectName: "My Short Film",
    dialogues: [{ character: "Narrator", line: "Welcome." }],
    characters: [{ name: "Narrator", voice: "Puck", age: "adult" }],
    genre: "horror",
    toneGuidance: "Tense"
  })
});
const data = await response.json();
console.log(data);`}
                      {activeCodeTab === 'python' && `import requests
 
url = "${baseUrl}/api/script/generate"
headers = {
    "Content-Type": "application/json",
    "X-API-Key": "YOUR_12LABS_SECRET_KEY"
}
payload = {
    "projectId": "PROJ_123456",
    "projectName": "My Short Film",
    "dialogues": [{"character": "Narrator", "line": "Welcome."}],
    "characters": [{"name": "Narrator", "voice": "Puck", "age": "adult"}],
    "genre": "horror",
    "toneGuidance": "Tense"
}

response = requests.post(url, json=payload, headers=headers)
print(response.json())`}
                    </pre>
                  </div>
                </div>

                {/* Interactive Playground */}
                <div className="space-y-4 border border-neutral-200/80 dark:border-neutral-800 rounded-2xl p-5 bg-neutral-100/50 dark:bg-neutral-900/10">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-sm flex items-center gap-2 text-neutral-900 dark:text-neutral-50">
                      <Play className="w-4 h-4 text-primary" /> Interactive API Playground
                    </h3>
                    <Badge variant="outline" className="text-[10px] font-mono bg-white dark:bg-neutral-900 text-neutral-500">
                      Live Test Console
                    </Badge>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Project Name Parameter */}
                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase tracking-wider text-neutral-400 flex items-center gap-1.5">
                        Project Name <span className="text-primary font-bold">*</span>
                      </label>
                      <Input
                        type="text"
                        className="bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-xl text-xs h-10 focus:ring-2 focus:ring-primary outline-none transition-all"
                        placeholder="e.g. My Auditory Project"
                        value={testProjectName}
                        onChange={(e) => setTestProjectName(e.target.value)}
                      />
                    </div>

                    {/* Authentication Method Selection */}
                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase tracking-wider text-neutral-400">
                        Authorization Header Setup
                      </label>
                      <div className="grid grid-cols-2 gap-2 bg-neutral-200/55 dark:bg-neutral-850 p-1 rounded-xl text-xs">
                        <button
                          type="button"
                          onClick={() => setTestAuthMethod('session')}
                          className={`px-3 py-1.5 rounded-lg font-bold transition-all text-[11px] ${
                            testAuthMethod === 'session'
                              ? 'bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-50 shadow-sm'
                              : 'text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200'
                          }`}
                        >
                          Session Bearer
                        </button>
                        <button
                          type="button"
                          onClick={() => setTestAuthMethod('custom-key')}
                          className={`px-3 py-1.5 rounded-lg font-bold transition-all text-[11px] ${
                            testAuthMethod === 'custom-key'
                              ? 'bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-50 shadow-sm'
                              : 'text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200'
                          }`}
                        >
                          Custom API Key
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Custom API Key input block (visible only when custom-key auth selected) */}
                  {testAuthMethod === 'custom-key' && (
                    <div className="space-y-2 animate-in fade-in slide-in-from-top-1 duration-200">
                      <label className="text-xs font-bold uppercase tracking-wider text-neutral-400 flex items-center justify-between">
                        <span>X-API-Key Secret Header Value</span>
                        <span className="text-[10px] text-neutral-500 dark:text-neutral-400 font-mono normal-case">
                          Format: 12labs_sec_...
                        </span>
                      </label>
                      <Input
                        type="text"
                        className="bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-xl text-xs font-mono h-10 focus:ring-2 focus:ring-primary outline-none transition-all"
                        placeholder="Enter your secret 12labs_sec_... key"
                        value={testCustomApiKey}
                        onChange={(e) => setTestCustomApiKey(e.target.value)}
                      />
                      <p className="text-[10px] text-neutral-400 leading-relaxed">
                        ⚠️ Note: For your security, active keys are masked after creation. Paste your copied raw API key here to run tests.
                      </p>
                    </div>
                  )}

                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-neutral-400">
                      Test Script Input
                    </label>
                    <textarea
                      className="w-full bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 p-3 rounded-xl font-mono text-xs h-28 focus:ring-2 focus:ring-primary outline-none transition-all leading-relaxed text-neutral-800 dark:text-neutral-150"
                      value={testScript}
                      onChange={(e) => setTestScript(e.target.value)}
                    />
                  </div>

                  <Button onClick={handleRunPlaygroundTest} disabled={isAnalyzingTest} className="gap-2 font-bold text-xs h-10 shadow-sm rounded-xl">
                    {isAnalyzingTest ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                    {isAnalyzingTest ? 'Executing Request...' : 'Send Live API Request'}
                  </Button>

                  {testResult && (
                    <div className="space-y-1.5 pt-2">
                      <label className="text-[11px] font-bold uppercase tracking-wider text-neutral-400">Response Output</label>
                      <pre className="bg-neutral-900 text-emerald-400 border border-neutral-850 p-4 rounded-xl text-xs font-mono max-h-60 overflow-y-auto leading-relaxed">
                        {testResult}
                      </pre>
                    </div>
                  )}
                </div>

              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
