import { createClient } from '@/lib/supabase/server';
import { Badge, BrandMark, BrowserMockup, Card } from '@/components/ui/design-system';
import { notFound } from 'next/navigation';

interface Issue {
  type: string;
  description: string;
  severity: 'critical' | 'medium' | 'low';
  location?: string;
  endpoint?: string;
  method?: string;
  statusCode?: number | string;
  reproSteps?: string[];
}

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

const severityOrder: Record<string, number> = { critical: 0, medium: 1, low: 2 };

export default async function PublicReportPage({
  params,
}: {
  params: Promise<{ scanId: string }>;
}) {
  const { scanId } = await params;
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('scans')
    .select('*')
    .eq('id', scanId)
    .eq('is_public', true)
    .single();

  if (error || !data) {
    notFound();
  }

  let analysis: { summary: string; priorityFix: string; issues: Issue[] };
  try {
    analysis = JSON.parse(data.analysis);
  } catch {
    analysis = { summary: data.analysis, priorityFix: '', issues: [] };
  }

  const scanData = data.scan_data;
  const issues = analysis.issues || [];
  const sortedIssues = [...issues].sort(
    (a, b) => severityOrder[a.severity] - severityOrder[b.severity]
  );
  const criticalCount = issues.filter((i) => i.severity === 'critical').length;
  const totalIssues = issues.length;

  return (
    <div className="min-h-screen w-full overflow-x-hidden bg-[#FAFAF9] text-[#0A0A0A]">
      <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 lg:py-12">
        <Card className="mb-6 border-[#0A0A0A] bg-[#F7FAFA] p-5 sm:p-6">
          <div className="flex min-w-0 items-center gap-3">
            <BrandMark size="lg" className="shrink-0 rounded-2xl" />
            <div className="min-w-0">
              <h1 className="text-2xl font-semibold tracking-tight">Krato QA Report</h1>
              <p className="text-sm text-[#404040]">Public scan report — shared by the site owner.</p>
            </div>
          </div>
        </Card>

        <Card className="p-4 sm:p-6">
          <div className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold">Scan Summary</h2>
            <Badge tone={criticalCount > 0 ? 'red' : totalIssues > 0 ? 'amber' : 'mint'}>
              {totalIssues > 0 ? `${totalIssues} issues found` : 'No issues found'}
            </Badge>
          </div>

          <div className="mt-6 space-y-6">
            <div className="min-w-0 space-y-4">
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-[#404040]">Summary</h3>
                <p className="mt-1 break-words text-sm text-[#404040]">{analysis.summary}</p>
              </div>
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-[#404040]">Priority Fix</h3>
                <p className="mt-1 break-words text-sm text-[#404040]">{analysis.priorityFix}</p>
              </div>
            </div>

            <div className="min-w-0">
              <BrowserMockup title="Scan data" url={scanData.url} className="min-w-0 bg-[#FAFAF9]">
                <div className="min-w-0 space-y-2 text-sm text-[#404040]">
                  <div className="break-words"><span className="font-semibold text-[#0A0A0A]">URL:</span> {scanData.url}</div>
                  <div><span className="font-semibold text-[#0A0A0A]">Buttons:</span> {scanData.buttons?.length ?? 0}</div>
                  <div><span className="font-semibold text-[#0A0A0A]">Links:</span> {scanData.links?.length ?? 0}</div>
                  <div><span className="font-semibold text-[#0A0A0A]">Forms:</span> {scanData.formsCount ?? 0}</div>
                  <div><span className="font-semibold text-[#0A0A0A]">Inputs:</span> {scanData.inputsCount ?? 0}</div>
                </div>
              </BrowserMockup>
            </div>

            {data.screenshot && (
              <Card className="p-3 sm:p-4">
                <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-[#404040]">Screenshot</h3>
                <div className="mt-3 w-full overflow-hidden rounded-xl border-2 border-[#0A0A0A]">
                  <img src={data.screenshot} alt="Scan screenshot" className="w-full h-auto object-contain" />
                </div>
              </Card>
            )}

            <div className="min-w-0">
              <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-[#404040]">Issues</h3>
              <div className="mt-3 space-y-3">
                {sortedIssues.map((issue, index) => (
                  <Card key={`${issue.type}-${index}`} className="min-w-0 p-4">
                    <div className="flex min-w-0 items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold">{issue.type}</p>
                        <p className="mt-1 break-words text-sm text-[#404040]">{issue.description}</p>
                      </div>
                      <Badge tone={severityBadgeTone(issue.severity)}>{issue.severity}</Badge>
                    </div>

                    {issue.endpoint && (
                      <p className="mt-2 break-all rounded-lg bg-[#0A0A0A]/5 px-2 py-1 font-mono text-xs text-[#0A0A0A]">
                        {issue.method || 'GET'} {issue.endpoint}
                        {issue.statusCode !== undefined && ` → ${issue.statusCode}`}
                      </p>
                    )}

                    {issue.location && <p className="mt-2 break-words text-xs text-[#404040]">Location: {issue.location}</p>}
                  </Card>
                ))}
              </div>
            </div>
          </div>
        </Card>

        <p className="mt-6 text-center text-xs text-[#404040]">
          Powered by Krato — AI agent that tests your app and finds what's broken.
        </p>
      </div>
    </div>
  );
}