'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Badge, BrandMark, BrowserMockup, Button, Card } from '@/components/ui/design-system';

interface Issue {
  type: string;
  description: string;
  severity: 'critical' | 'medium' | 'low';
  location?: string;
  endpoint?: string;
  method?: string;
  statusCode?: number | string;
  reproSteps?: string[];
  evidence?: string;
}

interface Analysis {
  summary: string;
  priorityFix: string;
  issues: Issue[];
}

interface ScanResult {
  scanId?: string;
  scanData: {
    url: string;
    buttons: string[];
    links: string[];
    formsCount: number;
    inputsCount: number;
    consoleErrors: string[];
    networkErrors: { url: string; status: number | string }[];
  };
  analysis: Analysis;
  screenshot: string;
}

interface HistoryItem {
  id: string;
  url: string;
  created_at: string;
}

type ExplorationStyle = 'happy_path' | 'edge_case';

const severityOrder: Record<string, number> = { critical: 0, medium: 1, low: 2 };

function severityBadgeTone(severity: string) {
  switch (severity) {
    case 'critical':
      return 'red' as const;
    case 'medium':
      return 'amber' as const;
    default:
      return 'cyan' as const;
  }
}

function issueKey(issue: Issue) {
  return `${issue.type}-${issue.description}-${issue.endpoint || ''}`;
}

export default function HomePageClient() {
  const [url, setUrl] = useState('');
  const [style, setStyle] = useState<ExplorationStyle>('happy_path');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState('');
  const [downloading, setDownloading] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [origin, setOrigin] = useState('');
  const [badgeOpen, setBadgeOpen] = useState(false);
  const [copied, setCopied] = useState({ markdown: false, html: false });
  const [userEmail, setUserEmail] = useState<string | null>(null);

  const [linearConnected, setLinearConnected] = useState(false);
  const [ticketState, setTicketState] = useState<Record<string, { loading: boolean; url?: string; error?: string }>>({});

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setOrigin(window.location.origin);
    }
  }, []);

  useEffect(() => {
    const supabase = createClient();
    let isMounted = true;

    async function loadUser() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (isMounted) {
        setUserEmail(user?.email ?? null);
      }
    }

    loadUser();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (isMounted) {
        setUserEmail(session?.user?.email ?? null);
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    async function checkLinearStatus() {
      try {
        const res = await fetch('/api/integrations/linear/status');
        if (res.ok) {
          const data = await res.json();
          setLinearConnected(!!data.connected);
        }
      } catch (err) {
        console.error('Failed to check Linear status', err);
      }
    }
    checkLinearStatus();
  }, [userEmail]);

  function connectLinear() {
    const clientId = process.env.NEXT_PUBLIC_LINEAR_CLIENT_ID;
    const redirectUri = process.env.NEXT_PUBLIC_LINEAR_REDIRECT_URI;
    const state = crypto.randomUUID();

    if (typeof window !== 'undefined') {
      window.localStorage.setItem('linear_oauth_state', state);
    }

    const authUrl = `https://linear.app/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(
      redirectUri || ''
    )}&response_type=code&scope=write&state=${state}`;

    window.location.href = authUrl;
  }

  async function createLinearTicket(issue: Issue) {
    const key = issueKey(issue);
    setTicketState((prev) => ({ ...prev, [key]: { loading: true } }));

    try {
      const res = await fetch('/api/integrations/linear/create-ticket', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: `${issue.type}: ${issue.description}`.slice(0, 120),
          description: [
            issue.description,
            issue.endpoint ? `Endpoint: ${issue.method || 'GET'} ${issue.endpoint}` : '',
            issue.statusCode !== undefined ? `Status: ${issue.statusCode}` : '',
            issue.location ? `Location: ${issue.location}` : '',
            issue.reproSteps && issue.reproSteps.length > 0
              ? `Reproduction steps:\n${issue.reproSteps.map((s, i) => `${i + 1}. ${s}`).join('\n')}`
              : '',
          ]
            .filter(Boolean)
            .join('\n\n'),
          severity: issue.severity,
          scanUrl: result?.scanData?.url,
        }),
      });

      const data = await res.json();

      if (res.status === 401 && data.needsConnect) {
        setLinearConnected(false);
        setTicketState((prev) => ({ ...prev, [key]: { loading: false, error: 'Connect Linear first' } }));
        return;
      }

      if (!res.ok) {
        setTicketState((prev) => ({ ...prev, [key]: { loading: false, error: data.error || 'Failed to create ticket' } }));
        return;
      }

      setTicketState((prev) => ({ ...prev, [key]: { loading: false, url: data.ticketUrl } }));
    } catch (err: any) {
      setTicketState((prev) => ({ ...prev, [key]: { loading: false, error: err.message || 'Failed to create ticket' } }));
    }
  }

  async function handleScan() {
    if (!url) return;
    setLoading(true);
    setError('');
    setResult(null);
    setTicketState({});

    try {
      const res = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, email: email || undefined, style }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Something went wrong');
      } else {
        setResult(data);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to scan');
    } finally {
      setLoading(false);
    }
  }

  async function downloadPDF() {
    if (!result) return;
    setDownloading(true);
    try {
      const res = await fetch('/api/reports/pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: result.scanData.url,
          analysis: result.analysis,
          scanData: result.scanData,
        }),
      });
      if (!res.ok) throw new Error('PDF generation failed');
      const blob = await res.blob();
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = 'krato-report.pdf';
      link.click();
    } catch (err) {
      console.error(err);
    } finally {
      setDownloading(false);
    }
  }

  async function scheduleDailyScan() {
    if (!url) return;
    try {
      const res = await fetch('/api/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      if (!res.ok) throw new Error('Failed to schedule');
      alert('Daily scan scheduled for this URL!');
    } catch (err) {
      console.error(err);
      alert('Failed to schedule scan.');
    }
  }

  async function loadHistory() {
    setHistoryLoading(true);
    try {
      const res = await fetch('/api/history');
      const data = await res.json();
      setHistory(data.scans || []);
    } catch (err) {
      console.error(err);
    } finally {
      setHistoryLoading(false);
    }
  }

  function toggleHistory() {
    const opening = !historyOpen;
    setHistoryOpen(opening);
    if (opening) loadHistory();
  }

  async function loadPastScan(id: string) {
    setLoading(true);
    setError('');
    setHistoryOpen(false);
    try {
      const res = await fetch(`/api/history/${id}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to load scan');
      } else {
        setResult(data);
        setUrl(data.scanData.url);
        setTicketState({});
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load scan');
    } finally {
      setLoading(false);
    }
  }

  async function copyToClipboard(text: string, type: 'markdown' | 'html') {
    try {
      await navigator.clipboard.writeText(text);
      setCopied((prev) => ({ ...prev, [type]: true }));
      window.setTimeout(() => {
        setCopied((prev) => ({ ...prev, [type]: false }));
      }, 1500);
    } catch (err) {
      console.error('Clipboard copy failed', err);
    }
  }

  async function handleSignOut() {
    try {
      if (typeof window !== 'undefined') {
        window.localStorage.removeItem('krato_seen_landing');
      }
      await fetch('/api/auth/signout', { method: 'POST' });
    } finally {
      window.location.assign('/login');
    }
  }

  const issues = result?.analysis?.issues || [];
  const sortedIssues = [...issues].sort(
    (a, b) => severityOrder[a.severity] - severityOrder[b.severity]
  );
  const criticalCount = issues.filter((i) => i.severity === 'critical').length;
  const totalIssues = issues.length;

  return (
    <div className="min-h-screen bg-[#FAFAF9] text-[#0A0A0A]">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
        <Card className="mb-6 border-[#0A0A0A] bg-[#F7FAFA] p-5 sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-3">
              <BrandMark size="lg" className="rounded-2xl" />
              <div>
                <h1 className="text-2xl font-semibold tracking-tight">Krato</h1>
                <p className="text-sm text-[#404040]">AI agent that tests your app and finds what is broken.</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {userEmail ? <span className="rounded-full border-2 border-[#0A0A0A] bg-[#FAFAF9] px-3 py-1 text-xs font-semibold text-[#404040]">{userEmail}</span> : null}
              {linearConnected ? (
                <Badge tone="mint">Linear connected</Badge>
              ) : (
                <Button onClick={connectLinear} variant="secondary">Connect Linear</Button>
              )}
              <Button onClick={toggleHistory} variant="secondary">History</Button>
              {userEmail ? <Button onClick={handleSignOut} variant="ghost">Sign out</Button> : null}
            </div>
          </div>
        </Card>

        {historyOpen && (
          <Card className="mb-6 max-h-72 overflow-y-auto p-4">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.2em] text-[#404040]">Past Scans</h2>
            {historyLoading && <p className="text-sm text-[#404040]">Loading...</p>}
            {!historyLoading && history.length === 0 && <p className="text-sm text-[#404040]">No scans yet.</p>}
            {!historyLoading && history.map((h) => (
              <button key={h.id} onClick={() => loadPastScan(h.id)} className="flex w-full items-center justify-between rounded-xl border-2 border-transparent px-3 py-2 text-left text-sm text-[#0A0A0A] transition-all duration-300 hover:border-[#0A0A0A] hover:bg-[#D1FAE5]">
                <span className="truncate">{h.url}</span>
                <span className="ml-2 whitespace-nowrap text-xs text-[#404040]">{new Date(h.created_at).toLocaleDateString()}</span>
              </button>
            ))}
          </Card>
        )}

        <Card className="mb-6 p-4 sm:p-6">
          <div className="flex flex-col gap-3 lg:flex-row">
            <input type="text" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://your-app.com" suppressHydrationWarning className="flex-1 rounded-xl border-2 border-[#0A0A0A] bg-[#FAFAF9] px-4 py-3 text-sm text-[#0A0A0A] outline-none transition focus:ring-2 focus:ring-cyan-400" />
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button onClick={handleScan} variant="primary" disabled={loading} suppressHydrationWarning>
                {loading ? 'Scanning...' : 'Scan'}
              </Button>
              <Button onClick={scheduleDailyScan} variant="secondary" disabled={!url}>
                Schedule Daily
              </Button>
            </div>
          </div>

          <div className="mt-4">
            <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.2em] text-[#404040]">Exploration style</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setStyle('happy_path')}
                className={`rounded-xl border-2 border-[#0A0A0A] px-4 py-2 text-sm font-semibold transition ${
                  style === 'happy_path' ? 'bg-[#0A0A0A] text-white' : 'bg-[#FAFAF9] text-[#0A0A0A]'
                }`}
              >
                Happy Path
              </button>
              <button
                type="button"
                onClick={() => setStyle('edge_case')}
                className={`rounded-xl border-2 border-[#0A0A0A] px-4 py-2 text-sm font-semibold transition ${
                  style === 'edge_case' ? 'bg-[#0A0A0A] text-white' : 'bg-[#FAFAF9] text-[#0A0A0A]'
                }`}
              >
                Edge Case
              </button>
            </div>
            <p className="mt-1 text-xs text-[#404040]">
              {style === 'edge_case'
                ? 'Fills forms with extreme/invalid data and force-submits them to probe validation.'
                : 'Scans normally, like a real user browsing the app.'}
            </p>
          </div>

          <div className="mt-4">
            <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.2em] text-[#404040]">Email for report (optional)</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" className="w-full rounded-xl border-2 border-[#0A0A0A] bg-[#FAFAF9] px-4 py-3 text-sm text-[#0A0A0A] outline-none transition focus:ring-2 focus:ring-cyan-400" />
          </div>
        </Card>

        <div className="mb-8 flex flex-wrap justify-center gap-4 text-sm text-[#404040]">
          <Badge tone="mint">Finds broken buttons & links</Badge>
          <Badge tone="cyan">Catches console & network errors</Badge>
          <Badge tone="mint">AI explains issues in plain English</Badge>
        </div>

        {error && <div className="mb-6 rounded-2xl border-2 border-red-400 bg-red-50 p-4 text-sm text-red-700">{error}</div>}

        {loading && (
          <Card className="flex flex-col items-center justify-center gap-4 py-14">
            <BrandMark size="lg" className="animate-pulse" />
            <p className="text-sm font-semibold text-[#404040]">Scanning...</p>
          </Card>
        )}

        {result && (
          <div className="space-y-6">
            <Card className="p-4 sm:p-6">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <h2 className="text-lg font-semibold">Scan Summary</h2>
                <div className="flex flex-wrap items-center gap-2">
                  <Button onClick={downloadPDF} variant="primary" disabled={downloading}>
                    {downloading ? 'Generating...' : 'Download PDF'}
                  </Button>
                  <Button onClick={() => setBadgeOpen((open) => !open)} variant="secondary">
                    {badgeOpen ? 'Hide Badge' : 'Embed Badge'}
                  </Button>
                  <Badge tone={criticalCount > 0 ? 'red' : totalIssues > 0 ? 'amber' : 'mint'}>{totalIssues > 0 ? `${totalIssues} issues found` : 'No issues found'}</Badge>
                </div>
              </div>

              {badgeOpen && (
                <Card className="mt-4 bg-[#FAFAF9] p-4 text-sm">
                  {result.scanId ? (
                    <div className="space-y-4">
                      <div className="text-sm font-semibold text-[#0A0A0A]">Badge embed code</div>
                      <div className="space-y-3">
                        <div>
                          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-[#404040]">Markdown</p>
                          <div className="flex flex-col gap-2 sm:flex-row">
                            <input type="text" readOnly value={`[![Krato QA](${origin ? `${origin}/api/badge/${result.scanId}` : `/api/badge/${result.scanId}`})](${result.scanData.url})`} className="flex-1 rounded-xl border-2 border-[#0A0A0A] bg-white px-4 py-3 text-xs text-[#0A0A0A]" />
                            <Button onClick={() => copyToClipboard(`[![Krato QA](${origin ? `${origin}/api/badge/${result.scanId}` : `/api/badge/${result.scanId}`})](${result.scanData.url})`, 'markdown')} variant="secondary">{copied.markdown ? 'Copied!' : 'Copy'}</Button>
                          </div>
                        </div>
                        <div>
                          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-[#404040]">HTML</p>
                          <div className="flex flex-col gap-2 sm:flex-row">
                            <input type="text" readOnly value={`<a href="${result.scanData.url}" target="_blank" rel="noopener noreferrer"><img src="${origin ? `${origin}/api/badge/${result.scanId}` : `/api/badge/${result.scanId}`}" alt="Krato QA" /></a>`} className="flex-1 rounded-xl border-2 border-[#0A0A0A] bg-white px-4 py-3 text-xs text-[#0A0A0A]" />
                            <Button onClick={() => copyToClipboard(`<a href="${result.scanData.url}" target="_blank" rel="noopener noreferrer"><img src="${origin ? `${origin}/api/badge/${result.scanId}` : `/api/badge/${result.scanId}`}" alt="Krato QA" /></a>`, 'html')} variant="secondary">{copied.html ? 'Copied!' : 'Copy'}</Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : <div className="text-sm text-[#404040]">Badge embed unavailable for this scan.</div>}
                </Card>
              )}

              <div className="mt-6 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
                <div className="space-y-4">
                  <div>
                    <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-[#404040]">Summary</h3>
                    <p className="mt-1 text-sm text-[#404040]">{result.analysis.summary}</p>
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-[#404040]">Priority Fix</h3>
                    <p className="mt-1 text-sm text-[#404040]">{result.analysis.priorityFix}</p>
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-[#404040]">Issues</h3>
                    <div className="mt-3 space-y-3">
                      {sortedIssues.map((issue) => {
                        const key = issueKey(issue);
                        const ticket = ticketState[key];
                        return (
                          <Card key={key} className="p-4">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="text-sm font-semibold">{issue.type}</p>
                                <p className="mt-1 text-sm text-[#404040]">{issue.description}</p>
                              </div>
                              <Badge tone={severityBadgeTone(issue.severity)}>{issue.severity}</Badge>
                            </div>

                            {issue.endpoint && (
                              <p className="mt-2 rounded-lg bg-[#0A0A0A]/5 px-2 py-1 font-mono text-xs text-[#0A0A0A]">
                                {issue.method || 'GET'} {issue.endpoint}
                                {issue.statusCode !== undefined && ` → ${issue.statusCode}`}
                              </p>
                            )}

                            {issue.reproSteps && issue.reproSteps.length > 0 && (
                              <details className="mt-2">
                                <summary className="cursor-pointer text-xs font-semibold text-[#404040]">
                                  Reproduction steps
                                </summary>
                                <ol className="mt-1 list-decimal space-y-0.5 pl-4 text-xs text-[#404040]">
                                  {issue.reproSteps.map((step, idx) => (
                                    <li key={idx}>{step}</li>
                                  ))}
                                </ol>
                              </details>
                            )}

                            {issue.location && <p className="mt-2 text-xs text-[#404040]">Location: {issue.location}</p>}

                            <div className="mt-3 flex items-center gap-2">
                              {ticket?.url ? (
                                <a href={ticket.url} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-cyan-700 underline">
                                  View in Linear →
                                </a>
                              ) : (
                                <Button
                                  onClick={() => (linearConnected ? createLinearTicket(issue) : connectLinear())}
                                  variant="secondary"
                                  disabled={ticket?.loading}
                                >
                                  {ticket?.loading ? 'Creating...' : linearConnected ? 'Create Linear Ticket' : 'Connect Linear to create ticket'}
                                </Button>
                              )}
                              {ticket?.error && <span className="text-xs text-red-600">{ticket.error}</span>}
                            </div>
                          </Card>
                        );
                      })}
                    </div>
                  </div>
                </div>
                <div className="space-y-4">
                  <BrowserMockup title="Scan data" url={result.scanData.url} className="bg-[#FAFAF9]">
                    <div className="space-y-2 text-sm text-[#404040]">
                      <div><span className="font-semibold text-[#0A0A0A]">URL:</span> {result.scanData.url}</div>
                      <div><span className="font-semibold text-[#0A0A0A]">Buttons:</span> {result.scanData.buttons.length}</div>
                      <div><span className="font-semibold text-[#0A0A0A]">Links:</span> {result.scanData.links.length}</div>
                      <div><span className="font-semibold text-[#0A0A0A]">Forms:</span> {result.scanData.formsCount}</div>
                      <div><span className="font-semibold text-[#0A0A0A]">Inputs:</span> {result.scanData.inputsCount}</div>
                      <div><span className="font-semibold text-[#0A0A0A]">Console errors:</span> {result.scanData.consoleErrors.length}</div>
                      <div><span className="font-semibold text-[#0A0A0A]">Network errors:</span> {result.scanData.networkErrors.length}</div>
                    </div>
                  </BrowserMockup>
                  <Card className="p-4">
                    <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-[#404040]">Screenshot</h3>
                    <img src={result.screenshot} alt="Scan screenshot" className="mt-3 w-full rounded-xl border-2 border-[#0A0A0A] object-cover" />
                  </Card>
                </div>
              </div>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}