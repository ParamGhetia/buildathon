'use client'
import { useState, useEffect } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const CATEGORIES = ['Food & Drinks','Outdoors','Arts & Culture','Sports & Active','Games & Fun','Entertainment','Random Surprise']
const TIMES = ['30 min','1 hour','2 hours','Half day','Full day']
const BUDGETS = ['Free','Under $10','$10–30','$30–60','$60+']
const DELAY_SECONDS = 60
type Stage = 'waiting'|'compatibility'|'prefs'|'generating'|'countdown'|'result'

export default function SessionPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const sessionId = params.id as string
  const userRole = searchParams.get('user')
  const [session, setSession] = useState<any>(null)
  const [stage, setStage] = useState<Stage>('waiting')
  const [compatResult, setCompatResult] = useState<string|null>(null)
  const [time, setTime] = useState('')
  const [budget, setBudget] = useState('')
  const [excludedCats, setExcludedCats] = useState<string[]>([])
  const [location, setLocation] = useState('')
  const [activity, setActivity] = useState('')
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState('')
  const [countdown, setCountdown] = useState(DELAY_SECONDS)

  function getCompatibility(a: string, b: string) {
    if (!a || !b) return 'good'
    if (a.slice(1,3) === b.slice(1,3)) return 'great'
    if (a[0] === b[0]) return 'good'
    return 'mixed'
  }

  function handleMatched(data: any) {
    setCompatResult(getCompatibility(data.user_a?.personality||'', data.user_b?.personality||''))
    setStage('compatibility')
  }

  // Countdown timer — starts when activity is ready, reveals after DELAY_SECONDS
  useEffect(() => {
    if (stage !== 'countdown') return
    setCountdown(DELAY_SECONDS)
    const interval = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(interval)
          setStage('result')
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [stage])

  useEffect(() => {
    supabase.from('sessions').select('*').eq('id', sessionId).single().then(({ data }) => {
      if (data) {
        setSession(data)
        if (data.status === 'matched') handleMatched(data)
        if (data.activity) { setActivity(data.activity); setStage('countdown') }
      }
    })
    const channel = supabase.channel(`session-${sessionId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'sessions', filter: `id=eq.${sessionId}` }, ({ new: updated }) => {
        setSession(updated)
        if (updated.status === 'matched' && stage === 'waiting') handleMatched(updated)
        if (updated.activity && !activity) { setActivity(updated.activity); setStage('countdown') }
      }).subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [sessionId])

  function toggleCat(c: string) {
    setExcludedCats(prev => prev.includes(c) ? prev.filter(x=>x!==c) : [...prev, c])
  }

  async function generateActivity() {
    if (!time || !budget) { setError('Please fill in time and budget.'); return }
    setGenerating(true); setStage('generating'); setError('')
    try {
      const remaining = CATEGORIES.filter(c => !excludedCats.includes(c))
      const res = await fetch('/api/generate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userA: session?.user_a, userB: session?.user_b, time, budget, location: location||'anywhere nearby', excludedCategories: excludedCats, availableCategories: remaining }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      await supabase.from('sessions').update({ activity: data.activity, status: 'done' }).eq('id', sessionId)
      setActivity(data.activity)
      setStage('countdown')
    } catch(e: any) { setError(e.message||'Failed to generate.'); setStage('prefs') }
    finally { setGenerating(false) }
  }

  if (!session) return (
    <main className="page"><div className="card"><div className="waiting">
      <div className="waiting-dots"><span/><span/><span/></div>
      <p style={{marginTop:16}}>Loading...</p>
    </div></div></main>
  )

  const userA = session.user_a
  const userB = session.user_b
  const me = userRole === 'a' ? userA : userB
  const pct = ((DELAY_SECONDS - countdown) / DELAY_SECONDS) * 100

  return (
    <main className="page">
      <div className="card">
        <div className="logo">Beacon · Session</div>

        {stage === 'waiting' && <>
          <div className="beacon-wrap"><div className="beacon-ring"/><div className="beacon-ring"/><div className="beacon-dot"/></div>
          <h2>Beacon is live</h2>
          <p>Hey <strong style={{color:'var(--text)'}}>{me?.name}</strong>! Waiting for someone to scan the beacon...</p>
          <div className="waiting"><div className="waiting-dots"><span/><span/><span/></div></div>
        </>}

        {stage === 'compatibility' && <>
          <h2>Someone joined!</h2>
          <div style={{display:'flex',justifyContent:'space-between',marginBottom:20,gap:12}}>
            <div style={{flex:1,background:'var(--surface2)',borderRadius:10,padding:'14px',textAlign:'center'}}>
              <div style={{fontSize:12,color:'var(--muted)',fontFamily:'var(--font-mono)',marginBottom:4}}>YOU</div>
              <div style={{fontWeight:600}}>{userA?.name}</div>
              <div style={{fontSize:13,color:'var(--accent)',fontFamily:'var(--font-mono)'}}>{userA?.personality}</div>
            </div>
            <div style={{display:'flex',alignItems:'center',fontSize:20}}>⚡</div>
            <div style={{flex:1,background:'var(--surface2)',borderRadius:10,padding:'14px',textAlign:'center'}}>
              <div style={{fontSize:12,color:'var(--muted)',fontFamily:'var(--font-mono)',marginBottom:4}}>THEM</div>
              <div style={{fontWeight:600}}>{userB?.name}</div>
              <div style={{fontSize:13,color:'var(--accent)',fontFamily:'var(--font-mono)'}}>{userB?.personality}</div>
            </div>
          </div>
          {compatResult === 'great' && <div className="compat-good">✦ Great match! You two should get along really well.</div>}
          {compatResult === 'good' && <div className="compat-good">✓ Good compatibility. Should be a fun time!</div>}
          {compatResult === 'mixed' && <div className="compat-warn">⚠ Different personalities — opposites attract!</div>}
          {userRole === 'a'
            ? <button className="btn" onClick={() => setStage('prefs')}>Pick an activity →</button>
            : <div className="waiting" style={{textAlign:'center'}}><p>Waiting for {userA?.name} to set preferences...</p><div className="waiting-dots" style={{marginTop:12}}><span/><span/><span/></div></div>
          }
        </>}

        {stage === 'prefs' && <>
          <div className="step-label">Step 2 of 2</div>
          <h2>Plan it out</h2>
          <label>How much time?</label>
          <div className="tag-grid">{TIMES.map(t => <button key={t} className={`tag ${time===t?'selected':''}`} onClick={()=>setTime(t)}>{t}</button>)}</div>
          <label>Budget (combined)</label>
          <div className="tag-grid">{BUDGETS.map(b => <button key={b} className={`tag ${budget===b?'selected':''}`} onClick={()=>setBudget(b)}>{b}</button>)}</div>
          <label>Location hint (optional)</label>
          <input type="text" placeholder="e.g. downtown Chicago, near campus..." value={location} onChange={e=>setLocation(e.target.value)} />
          <label>Exclude categories (optional)</label>
          <div className="tag-grid">{CATEGORIES.map(c => <button key={c} className={`tag ${excludedCats.includes(c)?'selected':''}`} onClick={()=>toggleCat(c)}>{c}</button>)}</div>
          {error && <p style={{color:'var(--danger)'}}>{error}</p>}
          <button className="btn" onClick={generateActivity} disabled={generating}>Generate our activity →</button>
        </>}

        {stage === 'generating' && <div style={{textAlign:'center',padding:'24px 0'}}>
          <div className="beacon-wrap"><div className="beacon-ring"/><div className="beacon-ring"/><div className="beacon-dot"/></div>
          <h2>Finding your adventure...</h2>
          <div className="waiting-dots"><span/><span/><span/></div>
        </div>}

        {stage === 'countdown' && <div style={{textAlign:'center',padding:'16px 0'}}>
          <div className="beacon-wrap"><div className="beacon-ring"/><div className="beacon-ring"/><div className="beacon-dot"/></div>
          <h2>Activity incoming!</h2>
          <p>Check the beacon screen — your activity is being revealed there first.</p>
          <div style={{fontSize:48,fontFamily:'var(--font-mono)',fontWeight:700,color:'var(--accent)',margin:'16px 0'}}>{countdown}</div>
          <div style={{background:'var(--surface2)',borderRadius:100,height:6,overflow:'hidden',marginBottom:8}}>
            <div style={{height:'100%',background:'var(--accent)',width:`${pct}%`,transition:'width 1s linear',borderRadius:100}}/>
          </div>
          <p style={{fontSize:13}}>Revealing on your phone in {countdown}s</p>
        </div>}

        {stage === 'result' && <>
          <div className="step-label">Your activity</div>
          <div className="activity-card">
            <div className="activity-title">Adventure unlocked ✦</div>
            <div className="activity-body">{activity}</div>
          </div>
          <button className="btn btn-ghost" onClick={() => { setStage('prefs'); setActivity(''); setExcludedCats([]) }}>Generate another</button>
        </>}
      </div>
    </main>
  )
}
