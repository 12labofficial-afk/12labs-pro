'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Header } from '@/components/header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Code, Copy, Check, Terminal, Play, Sparkles, Volume2, Key, HelpCircle, ShieldCheck } from 'lucide-react';

export default function ApiDocsPage() {
  const [copiedEndpoint, setCopiedEndpoint] = useState<string | null>(null);
  const [testText, setTestText] = useState('Hello, welcome to AI Voice Studio API!');
  const [testCategory, setTestCategory] = useState('all');
  const [responseOutput, setResponseOutput] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'https://your-domain.com';

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedEndpoint(key);
    setTimeout(() => setCopiedEndpoint(null), 2000);
  };

  const handleTestVoicesApi = async () => {
    setIsLoading(true);
    setResponseOutput('Loading...');
    try {
      const url = `${baseUrl}/api/voices${testCategory !== 'all' ? `?category=${testCategory}` : ''}`;
      const res = await fetch(url);
      const data = await res.json();
      setResponseOutput(JSON.stringify(data, null, 2));
    } catch (err: any) {
      setResponseOutput(JSON.stringify({ error: err.message }, null, 2));
    } finally {
      setIsLoading(false);
    }
  };

  const handleTestTtsApi = async () => {
    setIsLoading(true);
    setResponseOutput('Generating...');
    try {
      const res = await fetch(`${baseUrl}/api/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: testText,
          voiceId: 'en-US-Standard-A',
          pitch: 1,
          speed: 1,
        }),
      });
      const data = await res.json();
      setResponseOutput(JSON.stringify(data, null, 2));
    } catch (err: any) {
      setResponseOutput(JSON.stringify({ error: err.message }, null, 2));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Header />
      <main className="py-10 px-4 md:px-8 max-w-6xl mx-auto space-y-8">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-6">
        <div className="space-y-3 text-center md:text-left">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-semibold">
            <Terminal className="w-3.5 h-3.5" /> REST API Documentation
          </div>
          <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight">Developer API Center</h1>
          <p className="text-muted-foreground text-sm md:text-base max-w-2xl">
            Integrate AI Voice Studio voices and text-to-speech engine directly into your external applications, apps, and services via simple HTTP endpoints.
          </p>
        </div>

        <Button asChild className="gap-2 font-bold shadow-md shrink-0">
          <Link href="/developer">
            <Key className="w-4 h-4" /> Manage API Secret Keys
          </Link>
        </Button>
      </div>

      {/* Quick Base URL Card */}
      <Card className="bg-card/50 backdrop-blur border-primary/20">
        <CardContent className="p-4 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Key className="w-5 h-5 text-primary" />
            <div>
              <p className="text-xs text-muted-foreground font-medium">Base Endpoint URL</p>
              <code className="text-sm font-bold text-foreground">{baseUrl}/api</code>
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="gap-2 text-xs"
            onClick={() => copyToClipboard(`${baseUrl}/api`, 'base')}
          >
            {copiedEndpoint === 'base' ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
            {copiedEndpoint === 'base' ? 'Copied!' : 'Copy Base URL'}
          </Button>
        </CardContent>
      </Card>

      {/* Endpoints Documentation Tabs */}
      <Tabs defaultValue="voices" className="w-full">
        <TabsList className="grid w-full grid-cols-2 max-w-md mx-auto md:mx-0">
          <TabsTrigger value="voices" className="flex items-center gap-2">
            <Volume2 className="w-4 h-4" /> 1. Get Voices API
          </TabsTrigger>
          <TabsTrigger value="tts" className="flex items-center gap-2">
            <Sparkles className="w-4 h-4" /> 2. Text-to-Speech API
          </TabsTrigger>
        </TabsList>

        {/* 1. GET VOICES ENDPOINT */}
        <TabsContent value="voices" className="mt-6 space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge className="bg-blue-600 hover:bg-blue-700 text-white font-mono">GET</Badge>
                  <code className="text-sm font-semibold">/api/voices</code>
                </div>
                <Badge variant="outline" className="text-xs">Public Access</Badge>
              </div>
              <CardDescription className="mt-2">
                Retrieves the complete list of available AI voices with optional filters for category, gender, or search keyword.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h4 className="text-xs font-bold uppercase text-muted-foreground mb-2">Query Parameters</h4>
                <div className="border rounded-md divide-y text-xs">
                  <div className="p-2.5 flex justify-between items-center">
                    <div>
                      <span className="font-mono font-bold text-primary">category</span>
                      <span className="text-muted-foreground ml-2">(Optional)</span>
                    </div>
                    <span className="text-muted-foreground">standard | pro | chatterbox | new-studio</span>
                  </div>
                  <div className="p-2.5 flex justify-between items-center">
                    <div>
                      <span className="font-mono font-bold text-primary">gender</span>
                      <span className="text-muted-foreground ml-2">(Optional)</span>
                    </div>
                    <span className="text-muted-foreground">male | female</span>
                  </div>
                  <div className="p-2.5 flex justify-between items-center">
                    <div>
                      <span className="font-mono font-bold text-primary">search</span>
                      <span className="text-muted-foreground ml-2">(Optional)</span>
                    </div>
                    <span className="text-muted-foreground">Filter by voice name or keyword</span>
                  </div>
                </div>
              </div>

              {/* Code Examples */}
              <div>
                <h4 className="text-xs font-bold uppercase text-muted-foreground mb-2">Request Example (cURL / Fetch)</h4>
                <div className="bg-muted p-3 rounded-md font-mono text-xs overflow-x-auto relative group">
                  <pre>{`curl -X GET "${baseUrl}/api/voices?category=standard&gender=female"`}</pre>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="absolute top-1.5 right-1.5 h-7 w-7"
                    onClick={() => copyToClipboard(`curl -X GET "${baseUrl}/api/voices?category=standard&gender=female"`, 'curl-voices')}
                  >
                    {copiedEndpoint === 'curl-voices' ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                  </Button>
                </div>
              </div>

              {/* Live Test */}
              <div className="pt-2 border-t">
                <h4 className="text-xs font-bold uppercase text-muted-foreground mb-2 flex items-center gap-2">
                  <Play className="w-3.5 h-3.5 text-primary" /> Test Endpoint
                </h4>
                <div className="flex flex-col sm:flex-row gap-2">
                  <select
                    className="h-9 px-3 rounded-md border text-xs bg-background"
                    value={testCategory}
                    onChange={(e) => setTestCategory(e.target.value)}
                  >
                    <option value="all">All Categories</option>
                    <option value="standard">Standard Voices</option>
                    <option value="pro">Pro Voices</option>
                    <option value="chatterbox">ChatterBox Voices</option>
                    <option value="new-studio">New Studio Voices</option>
                  </select>
                  <Button size="sm" onClick={handleTestVoicesApi} disabled={isLoading}>
                    Send GET Request
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 2. TEXT-TO-SPEECH ENDPOINT */}
        <TabsContent value="tts" className="mt-6 space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge className="bg-green-600 hover:bg-green-700 text-white font-mono">POST</Badge>
                  <code className="text-sm font-semibold">/api/tts</code>
                </div>
                <Badge variant="outline" className="text-xs">JSON API</Badge>
              </div>
              <CardDescription className="mt-2">
                Converts text into speech parameters or generates audio. Supports both JSON body via POST and query string via GET.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h4 className="text-xs font-bold uppercase text-muted-foreground mb-2">JSON Body Parameters (POST)</h4>
                <div className="border rounded-md divide-y text-xs">
                  <div className="p-2.5 flex justify-between items-center">
                    <div>
                      <span className="font-mono font-bold text-primary">text</span>
                      <span className="text-red-500 ml-1">*Required</span>
                    </div>
                    <span className="text-muted-foreground">Text string to convert to speech</span>
                  </div>
                  <div className="p-2.5 flex justify-between items-center">
                    <div>
                      <span className="font-mono font-bold text-primary">voiceId</span>
                      <span className="text-muted-foreground ml-2">(Optional)</span>
                    </div>
                    <span className="text-muted-foreground">Voice ID from /api/voices</span>
                  </div>
                  <div className="p-2.5 flex justify-between items-center">
                    <div>
                      <span className="font-mono font-bold text-primary">pitch</span>
                      <span className="text-muted-foreground ml-2">(Optional)</span>
                    </div>
                    <span className="text-muted-foreground">Default: 1 (Range: 0.5 - 2.0)</span>
                  </div>
                  <div className="p-2.5 flex justify-between items-center">
                    <div>
                      <span className="font-mono font-bold text-primary">speed</span>
                      <span className="text-muted-foreground ml-2">(Optional)</span>
                    </div>
                    <span className="text-muted-foreground">Default: 1 (Range: 0.5 - 2.0)</span>
                  </div>
                </div>
              </div>

              {/* Code Examples */}
              <div>
                <h4 className="text-xs font-bold uppercase text-muted-foreground mb-2">Request Example (JavaScript Fetch)</h4>
                <div className="bg-muted p-3 rounded-md font-mono text-xs overflow-x-auto relative group">
                  <pre>{`fetch("${baseUrl}/api/tts", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    text: "Hello world!",
    voiceId: "en-US-Standard-A"
  })
})
.then(res => res.json())
.then(data => console.log(data));`}</pre>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="absolute top-1.5 right-1.5 h-7 w-7"
                    onClick={() => copyToClipboard(`fetch("${baseUrl}/api/tts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: "Hello world!", voiceId: "en-US-Standard-A" }) }).then(res => res.json());`, 'js-tts')}
                  >
                    {copiedEndpoint === 'js-tts' ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                  </Button>
                </div>
              </div>

              {/* Live Test */}
              <div className="pt-2 border-t">
                <h4 className="text-xs font-bold uppercase text-muted-foreground mb-2 flex items-center gap-2">
                  <Play className="w-3.5 h-3.5 text-primary" /> Test Endpoint
                </h4>
                <div className="flex flex-col sm:flex-row gap-2">
                  <Input
                    className="text-xs h-9"
                    value={testText}
                    onChange={(e) => setTestText(e.target.value)}
                    placeholder="Enter text to speak..."
                  />
                  <Button size="sm" onClick={handleTestTtsApi} disabled={isLoading}>
                    Send POST Request
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Response Display Box */}
      {responseOutput && (
        <Card className="border-primary/30">
          <CardHeader className="py-3 px-4 border-b flex flex-row items-center justify-between">
            <CardTitle className="text-xs font-mono font-bold flex items-center gap-2">
              <Code className="w-3.5 h-3.5 text-primary" /> API Response Output
            </CardTitle>
            <Button size="sm" variant="ghost" className="h-6 text-[10px]" onClick={() => setResponseOutput(null)}>
              Clear
            </Button>
          </CardHeader>
          <CardContent className="p-3 bg-muted/80 rounded-b-lg overflow-x-auto max-h-80">
            <pre className="font-mono text-xs text-foreground leading-relaxed">{responseOutput}</pre>
          </CardContent>
        </Card>
      )}

      {/* FAQ / Info Footer */}
      <Card className="bg-primary/5 border-primary/10">
        <CardContent className="p-4 space-y-2">
          <div className="flex items-center gap-2 text-sm font-bold text-primary">
            <HelpCircle className="w-4 h-4" /> Need Help or Integration Assistance?
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            All endpoints support standard CORS headers (Cross-Origin Resource Sharing), so you can query them directly from frontend web apps, Node.js servers, Python backends, or mobile applications.
          </p>
        </CardContent>
      </Card>
      </main>
    </div>
  );
}
