import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Free keep-alive endpoint for cron-job.org / UptimeRobot to prevent Supabase from pausing
export async function GET() {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json({ status: 'ok', message: 'App is healthy (Supabase config missing)' }, { status: 200 });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    // Lightweight touch to record activity on Supabase
    const { count, error } = await supabase
      .from('receipts')
      .select('*', { count: 'exact', head: true });

    if (error && error.code !== 'PGRST116') {
      // Return 200 anyway so ping monitor considers endpoint alive
      return NextResponse.json({ status: 'pinged', error: error.message }, { status: 200 });
    }

    return NextResponse.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      activeReceiptsCount: count ?? 0,
    });
  } catch (err: any) {
    return NextResponse.json({ status: 'error', message: err?.message }, { status: 200 });
  }
}
