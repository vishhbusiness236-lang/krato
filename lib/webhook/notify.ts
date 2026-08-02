export async function notifyWebhook(
  webhookUrl: string,
  platform: 'slack' | 'discord',
  siteUrl: string,
  summary: string,
  criticalCount: number,
  totalIssues: number,
  reportUrl?: string
) {
  try {
    if (platform === 'slack') {
      const payload = {
        text: `Krato scan report for ${siteUrl}`,
        blocks: [
          {
            type: 'header',
            text: {
              type: 'plain_text',
              text: 'Krato scan report',
            },
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*URL:* <${siteUrl}|${siteUrl}>
*Summary:* ${summary}
*Critical issues:* ${criticalCount}
*Total issues:* ${totalIssues}${reportUrl ? `\n*Report:* <${reportUrl}|Open report>` : ''}`,
            },
          },
        ],
      };

      await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      return;
    }

    if (platform === 'discord') {
      const embed: any = {
        title: 'Krato scan report',
        description: summary,
        color: criticalCount > 0 ? 0xff0000 : 0x00ff00,
        fields: [
          { name: 'URL', value: siteUrl, inline: false },
          { name: 'Critical issues', value: String(criticalCount), inline: true },
          { name: 'Total issues', value: String(totalIssues), inline: true },
        ],
      };

      if (reportUrl) {
        embed.fields.push({ name: 'Report', value: reportUrl, inline: false });
      }

      const payload = { embeds: [embed] };

      await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      return;
    }
  } catch (error) {
    console.error('Webhook notification failed', { error, webhookUrl, platform, siteUrl });
  }
}
