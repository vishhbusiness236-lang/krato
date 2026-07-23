// app/page.tsx

'use client';

import { useState } from 'react';

interface ScanResult {
  scanData: {
    url: string;
    buttons: string[];
    links: string[];
    formsCount: number;
    inputsCount: number;
    consoleErrors: string[];
    networkErrors: { url: string; status: number | string }[];
  };
  analysis: string;
  screenshot: string;
}

export default function Home() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState('');

  async function handleScan() {
    if (!url) return;
    setLoading(true);
    setError('');
    setResult(null);

    try {
      const res = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
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

  const totalIssues =
    (result?.scanData.consoleErrors.length || 0) +
    (result?.scanData.networkErrors.length || 0);

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <div className="max-w-3xl mx-auto px-6 py-16">
        {/* Header */}
        <div className="mb-10 text-center">
          <h1 className="text-3xl font-bold tracking-tight">Krato</h1>
          <p className="text-gray-500 mt-2">
            AI agent that tests your app and finds what's broken.
          </p>
        </div>

        {/* Input */}
       <div className="flex gap-2 mb-10">
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://your-app.com"
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
          <div className="text-center text-gray-500 text-sm py-10">
            Running Krato on your app — this can take 20-30 seconds...
          </div>
        )}

        {/* Results */}
        {result && (
          <div className="space-y-6">
            {/* Summary */}
            <div className="bg-white border border-gray-200 rounded-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold">Scan Summary</h2>
                <span
                  className={`text-xs font-medium px-3 py-1 rounded-full ${
                    totalIssues > 0
                      ? 'bg-red-100 text-red-700'
                      : 'bg-green-100 text-green-700'
                  }`}
                >
                  {totalIssues > 0 ? `${totalIssues} issues found` : 'No issues found'}
                </span>
              </div>
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

            {/* AI Analysis */}
            <div className="bg-white border border-gray-200 rounded-xl p-6">
              <h2 className="font-semibold mb-3">AI Analysis</h2>
              <pre className="whitespace-pre-wrap text-sm text-gray-700 font-sans leading-relaxed">
                {result.analysis}
              </pre>
            </div>

            {/* Errors */}
            {(result.scanData.consoleErrors.length > 0 ||
              result.scanData.networkErrors.length > 0) && (
              <div className="bg-white border border-gray-200 rounded-xl p-6">
                <h2 className="font-semibold mb-3">Errors Detected</h2>
                <ul className="space-y-2 text-sm">
                  {result.scanData.consoleErrors.map((e, i) => (
                    <li key={`c-${i}`} className="text-red-600">
                      • {e}
                    </li>
                  ))}
                  {result.scanData.networkErrors.map((e, i) => (
                    <li key={`n-${i}`} className="text-red-600">
                      • [{e.status}] {e.url}
                    </li>
                  ))}
                </ul>
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