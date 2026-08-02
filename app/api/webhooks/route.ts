import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const { url, webhookUrl, platform } = await req.json();

    if (!url || !webhookUrl || !platform) {
      return NextResponse.json(
        { error: 'url, webhookUrl, and platform are required' }, 
        { status: 400 }
      );
    }

    if (platform !== 'slack' && platform !== 'discord') {
      return NextResponse.json(
        { error: 'platform must be slack or discord' },
        { status: 400 }
      );
    }

    try {
      new URL(webhookUrl);
    } catch {
      return NextResponse.json(
        { error: 'Invalid webhook URL' },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    const { error } = await supabase.from('webhooks').insert({
      url,
      webhook_url: webhookUrl,
      platform,
    });

    if (error) {
      return NextResponse.json(
        { error: error.message || 'Failed to save webhook' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Something went wrong' },
      { status: 500 }
    );
  }
}
