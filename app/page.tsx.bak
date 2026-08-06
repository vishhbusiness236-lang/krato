// app/page.tsx

'use client';

import { useEffect, useState } from 'react';

interface Issue {
  type: string;
  description: string;
  severity: 'critical' | 'medium' | 'low';
  location?: string;
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

const severityStyles: Record<string, string> = {
  critical: 'bg-red-100 text-red-700 border-red-200',
  medium: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  low: 'bg-blue-100 text-blue-700 border-blue-200',
};

const severityOrder: Record<string, number> = { critical: 0, medium: 1, low: 2 };

export default function Home() {
  const [url, setUrl] = useState('');
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

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setOrigin(window.location.origin);
    }
  }, []);

  async function handleScan() {
    if (!url) return;
    setLoading(true);
    setError('');
    setResult(null);

    try {
      const res = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, email: email || undefined })
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

  const issues = result?.analysis?.issues || [];
  const sortedIssues = [...issues].sort(
    (a, b) => severityOrder[a.severity] - severityOrder[b.severity]
  );
  const criticalCount = issues.filter((i) => i.severity === 'critical').length;
  const totalIssues = issues.length;

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <div className="max-w-3xl mx-auto px-6 py-16">
        {/* Header */}
        <div className="mb-10 text-center flex flex-col items-center relative">
          <button
            onClick={toggleHistory}
            className="absolute right-0 top-0 text-xs font-medium px-4 py-2 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 transition-colors"
          >
            History
          </button>
          <img src="/logo.png" alt="Krato logo" className="w-16 h-16 rounded-2xl mb-3" />
          <h1 className="text-3xl font-bold tracking-tight">Krato</h1>
          <p className="text-gray-500 mt-2">
            AI agent that tests your app and finds what's broken.
          </p>
        </div>

        {/* History panel */}
        {historyOpen && (
          <div className="bg-white border border-gray-200 rounded-xl p-4 mb-6 max-h-72 overflow-y-auto">
            <h2 className="font-semibold mb-3 text-sm">Past Scans</h2>
            {historyLoading && <p className="text-sm text-gray-500">Loading...</p>}
            {!historyLoading && history.length === 0 && (
              <p className="text-sm text-gray-500">No scans yet.</p>
            )}
            {!historyLoading &&
              history.map((h) => (
                <button
                  key={h.id}
                  onClick={() => loadPastScan(h.id)}
                  className="w-full text-left flex items-center justify-between px-3 py-2 rounded-lg hover:bg-gray-50 text-sm"
                >
                  <span className="truncate">{h.url}</span>
                  <span className="text-gray-400 text-xs ml-2 whitespace-nowrap">
                    {new Date(h.created_at).toLocaleDateString()}
                  </span>
                </button>
              ))}
          </div>
        )}

        {/* Input */}
        <div className="flex gap-2 mb-3">
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://your-app.com"
            suppressHydrationWarning
            className="flex-1 border border-gray-300 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-black"
          />
          <button
            onClick={handleScan}
            disabled={loading}
            suppressHydrationWarning
            className="bg-black text-white px-6 py-3 rounded-lg text-sm font-medium disabled:opacity-50"
          >
            {loading ? 'Scanning...' : 'Scan'}
          </button>
          <button
            onClick={scheduleDailyScan}
            disabled={!url}
            className="border border-gray-300 text-gray-700 px-4 py-3 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
          >
            Schedule Daily
          </button>
        </div>

        {/* Email for report */}
        <div className="mb-6">
          <label className="block text-xs font-medium text-gray-500 mb-2">
            Email for report (optional)
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-black"
          />
        </div>

        <div className="flex justify-center gap-8 mb-10 text-sm text-gray-600">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green-500"></span>
            Finds broken buttons & links
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green-500"></span>
            Catches console & network errors
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green-500"></span>
            AI explains issues in plain English
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-4 mb-6">
            {error}
          </div>
        )}

        {loading && (
          <div className="flex flex-col items-center justify-center py-14 gap-4">
            <div className="w-12 h-12 border-[3px] border-gray-200 border-t-black rounded-full animate-spin"></div>
            <p className="text-gray-600 text-sm font-medium">Scanning...</p>
          </div>
        )}

        {/* Results */}
        {result && (
          <div className="space-y-6">
            {/* Summary */}
            <div className="bg-white border border-gray-200 rounded-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold">Scan Summary</h2>
                <div className="flex items-center gap-2">
                  <button
                    onClick={downloadPDF}
                    disabled={downloading}
                    className="text-sm font-medium px-5 py-2.5 rounded-lg bg-gray-900 text-white hover:bg-gray-700 active:scale-95 transition-all shadow-sm disabled:opacity-50 disabled:active:scale-100"
                  >
                    {downloading ? 'Generating...' : 'Download PDF'}
                  </button>
                  <button
                    onClick={() => setBadgeOpen((open) => !open)}
                    className="text-sm font-medium px-5 py-2.5 rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 active:scale-95 transition-all shadow-sm disabled:opacity-50"
                  >
                    {badgeOpen ? 'Hide Badge' : 'Embed Badge'}
                  </button>
                  <span
                    className={`text-xs font-medium px-3 py-1 rounded-full ${
                      criticalCount > 0
                        ? 'bg-red-100 text-red-700'
                        : totalIssues > 0
                        ? 'bg-yellow-100 text-yellow-700'
                        : 'bg-green-100 text-green-700'
                    }`}
                  >
                    {totalIssues > 0 ? `${totalIssues} issues found` : 'No issues found'}
                  </span>
                </div>
              </div>
              {badgeOpen && (
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 mt-4 text-sm">
                  {result.scanId ? (
                    <div className="space-y-4">
                      <div className="text-sm font-semibold text-gray-900">Badge embed code</div>
                      <div className="space-y-3">
                        <div>
                          <p className="text-xs font-medium text-gray-500 mb-2">Markdown</p>
                          <div className="flex gap-2">
                            <input
                              type="text"
                              readOnly
                              value={`[![Krato QA](${origin ? `${origin}/api/badge/${result.scanId}` : `/api/badge/${result.scanId}`})](${result.scanData.url})`}
                              className="flex-1 border border-gray-300 rounded-lg bg-white px-4 py-3 text-xs text-gray-700"
                            />
                            <button
                              type="button"
                              onClick={() =>
                                copyToClipboard(
                                  `[![Krato QA](${origin ? `${origin}/api/badge/${result.scanId}` : `/api/badge/${result.scanId}`})](${result.scanData.url})`,
                                  'markdown'
                                )
                              }
                              className="px-3 py-2 rounded-lg bg-gray-900 text-white text-xs font-medium hover:bg-gray-700"
                            >
                              {copied.markdown ? 'Copied!' : 'Copy'}
                            </button>
                          </div>
                        </div>
                        <div>
                          <p className="text-xs font-medium text-gray-500 mb-2">HTML</p>
                          <div className="flex gap-2">
                            <input
                              type="text"
                              readOnly
                              value={`<a href="${result.scanData.url}"><img src="${origin ? `${origin}/api/badge/${result.scanId}` : `/api/badge/${result.scanId}`}" alt="Krato QA status" /></a>`}
                              className="flex-1 border border-gray-300 rounded-lg bg-white px-4 py-3 text-xs text-gray-700"
                            />
                            <button
                              type="button"
                              onClick={() =>
                                copyToClipboard(
                                  `<a href="${result.scanData.url}"><img src="${origin ? `${origin}/api/badge/${result.scanId}` : `/api/badge/${result.scanId}`}" alt="Krato QA status" /></a>`,
                                  'html'
                                )
                              }
                              className="px-3 py-2 rounded-lg bg-gray-900 text-white text-xs font-medium hover:bg-gray-700"
                            >
                              {copied.html ? 'Copied!' : 'Copy'}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-sm text-gray-600">Save this scan to enable badges.</div>
                  )}
                </div>
              )}
              <div className="grid grid-cols-4 gap-4 text-center text-sm">
                <div>
                  <div className="text-xl font-bold">{result.scanData.buttons.length}</div>
                  <div className="text-gray-500">Buttons</div>
                </div>
                <div>
                  <div className="text-xl font-bold">{result.scanData.links.length}</div>
                  <div className="text-gray-500">Links</div>
                </div>
                <div>
                  <div className="text-xl font-bold">{result.scanData.formsCount}</div>
                  <div className="text-gray-500">Forms</div>
                </div>
                <div>
                  <div className="text-xl font-bold">{result.scanData.inputsCount}</div>
                  <div className="text-gray-500">Inputs</div>
                </div>
              </div>
            </div>

            {/* AI Summary */}
            <div className="bg-white border border-gray-200 rounded-xl p-6">
              <h2 className="font-semibold mb-3">AI Analysis</h2>
              <p className="text-sm text-gray-700 leading-relaxed mb-3">
                {result.analysis?.summary}
              </p>
              {result.analysis?.priorityFix && (
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm">
                  <span className="font-medium">Fix this first: </span>
                  {result.analysis.priorityFix}
                </div>
              )}
            </div>

            {/* Issues by severity */}
            {sortedIssues.length > 0 && (
              <div className="bg-white border border-gray-200 rounded-xl p-6">
                <h2 className="font-semibold mb-3">Issues</h2>
                <div className="space-y-2">
                  {sortedIssues.map((issue, i) => (
                    <div
                      key={i}
                      className={`border rounded-lg p-3 text-sm ${severityStyles[issue.severity] || 'bg-gray-50 border-gray-200 text-gray-700'}`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium">{issue.type}</span>
                        <span className="text-xs uppercase font-semibold tracking-wide">
                          {issue.severity}
                        </span>
                      </div>
                      <p className="text-sm opacity-90">{issue.description}</p>
                      {issue.location && (
                        <p className="text-xs opacity-70 mt-1">Location: {issue.location}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Screenshot */}
            <div className="bg-white border border-gray-200 rounded-xl p-6">
              <h2 className="font-semibold mb-3">Screenshot</h2>
              <img
                src={result.screenshot}
                alt="Scan screenshot"
                className="w-full rounded-lg border border-gray-200"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}