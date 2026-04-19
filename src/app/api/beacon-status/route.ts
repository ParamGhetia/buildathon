import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function GET(req: NextRequest) {
  const beaconId = req.nextUrl.searchParams.get('beacon_id')
  if (!beaconId) return NextResponse.json({ state: 'empty', activity: null })

  const { data } = await supabase
    .from('sessions')
    .select('status, activity, user_a, user_b')
    .eq('beacon_id', beaconId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (!data) return NextResponse.json({ state: 'empty', activity: null })

  return NextResponse.json({
    state: data.status,         // 'waiting', 'matched', 'done'
    activity: data.activity,    // the sentence, or null
    user_a: data.user_a?.name,
    user_b: data.user_b?.name,
  })
}
