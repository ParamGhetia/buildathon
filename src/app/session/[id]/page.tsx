'use client'
import { useState, useEffect, useRef } from 'react'
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

  // Use refs to avoid stale closures in realtime callback
  const stageRef = useRef<Stage>('waiting')
  const activityRef = useRef('')

  function setStageSync(s: Stage) {
    stageRef.current = s
    setStage(s)
  }

  function setActivitySync(a: string) {
    activityRef.current = a
    setActivity(a)
  }

  function getCompatibility(a: string, b: string) {
    if (!a || !b) return 'good'
    if (a.slice(1,3) === b.slice(1,3)) return 'great'
    if (a[0] === b[0]) return 'good'
    return 'mixed'
  }

  function handleMatched(data: any) {
    setCompatResult(getCompatibility(data.user_a?.personality||'', data.user_b?.personality||''))
    setStageSync('compatibility')
  }

  useEffect(() => {
    if (stage !== 'countdown') return
    setCountdown(DELAY_SECONDS)
    const interval = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) { clearInterval(interval); setStageSync('result'); return 0 }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [stage === 'countdown'])

  useEffect(() => {
    // Initial load
    supabase.from('sessions').select('*').eq('id', sessionId).single().then(({ data }) => {
      if (data) {
        setSession(data)
        if (data.status === 'matched' || data.status === 'done') handleMatched(data)
        if (data.activity) { setActivitySync(data.activity); setStageSync('countdown') }
      }
    })

    // Realtime — use refs to check current state, not stale closure values
    const channel = supabase.channel(`session-${sessionId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'sessions',
        filter: `id=eq.${sessionId}`
      }, ({ new: updated }) => {
        setSession(updated)
        if ((updated.status === 'matched' || updated.status === 'done') && stageRef.current === 'waiting') {
          handleMatched(updated)
        }
        if (updated.activity && !activityRef.current) {
          setActivitySync(updated.activity)
          setStageSync('countdown')
        }
      })
      .subscribe((status) => {
        console.log('Realtime status:', status)
      })

    return () => { supabase.removeChannel(channel) }
  }, [sessionId])

  function toggleCat(c: string) {
    setExcludedCats(prev => prev.includes(c) ? prev.filter(x=>x!==c) : [...prev, c])
  }

  async function generateActivity() {
    if (!time || !budget) { setError('Please fill in time and budget.'); return }
    setGenerating(true); setStageSync('generating'); setError('')
    try {
      const remaining = CATEGORIES.filter(c => !excludedCats.includes(c))
      const res = await fetch('/api/generate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userA: session?.user_a, userB: session?.user_b, time, budget, location: location||'anywhere nearby', excludedCategories: excludedCats, availableCategories: remaining }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      await supabase.from('sessions').update({ activity: data.activity, status: 'done' }).eq('id', sessionId)
      setActivitySync(data.activity)
      setStageSync('countdown')
    } catch(e: any) { setError(e.message||'Failed to generate.'); setStageSync('prefs') }
    finally { setGenerating(false) }
  }

  if (!session) return (
    <main className="page">
      <div className="page-bg"><div className="blob1"/><div className="blob2"/></div>
      <div className="card"><div className="waiting"><div className="waiting-dots"><span/><span/><span/></div><p style={{marginTop:16}}>Loading...</p></div></div>
    </main>
  )

  const userA = session.user_a
  const userB = session.user_b
  const me = userRole === 'a' ? userA : userB
  const pct = ((DELAY_SECONDS - countdown) / DELAY_SECONDS) * 100

  return (
    <main className="page">
      <div className="page-bg"><div className="blob1"/><div className="blob2"/></div>
      <div className="card">
        <div className="logo">Beacon · Quest</div>

        {stage === 'waiting' && <>
          <div className="beacon-wrap"><div className="beacon-ring"/><div className="beacon-ring"/><div className="beacon-dot"/></div>
          <h2>The beacon burns</h2>
          <p>Your beacon calls out into the world, <strong style={{color:'var(--text)'}}>{me?.name}</strong>. Another adventurer will answer.</p>
          <div className="waiting"><div className="waiting-dots"><span/><span/><span/></div></div>
        </>}

        {stage === 'compatibility' && <>
          <h2>A fellow adventurer appears</h2>
          <div style={{display:'flex',justifyContent:'space-between',marginBottom:20,gap:12}}>
            <div style={{flex:1,background:'rgba(255,255,255,0.6)',border:'1px solid var(--border)',borderRadius:4,padding:'14px',textAlign:'center'}}>
              <div style={{fontSize:10,color:'var(--muted)',letterSpacing:'0.2em',textTransform:'uppercase',marginBottom:4}}>YOU</div>
              <div style={{fontWeight:500,fontSize:15}}>{userA?.name}</div>
              <div style={{fontSize:12,color:'var(--accent)',letterSpacing:'0.05em'}}>{userA?.personality}</div>
            </div>
            <div style={{display:'flex',alignItems:'center',color:'var(--accent)',fontSize:18}}>×</div>
            <div style={{flex:1,background:'rgba(255,255,255,0.6)',border:'1px solid var(--border)',borderRadius:4,padding:'14px',textAlign:'center'}}>
              <div style={{fontSize:10,color:'var(--muted)',letterSpacing:'0.2em',textTransform:'uppercase',marginBottom:4}}>THEM</div>
              <div style={{fontWeight:500,fontSize:15}}>{userB?.name}</div>
              <div style={{fontSize:12,color:'var(--accent)',letterSpacing:'0.05em'}}>{userB?.personality}</div>
            </div>
          </div>
          {compatResult === 'great' && <div className="compat-good">✦ A fated meeting — your personalities align perfectly.</div>}
          {compatResult === 'good' && <div className="compat-good">✓ A strong pairing. This quest will suit you both.</div>}
          {compatResult === 'mixed' && <div className="compat-warn">⚠ Different souls — but the best adventures need contrast.</div>}
          {userRole === 'a'
            ? <button className="btn" onClick={() => setStageSync('prefs')}>Begin the quest →</button>
            : <div className="waiting" style={{textAlign:'center'}}><p>Your companion is charting the course. Stand by.</p><div className="waiting-dots" style={{marginTop:12}}><span/><span/><span/></div></div>
          }
        </>}

        {stage === 'prefs' && <>
          <div className="step-label">Chart your course</div>
          <h2>Set the conditions</h2>
          <label>How much time?</label>
          <div className="tag-grid">{TIMES.map(t => <button key={t} className={`tag ${time===t?'selected':''}`} onClick={()=>setTime(t)}>{t}</button>)}</div>
          <label>Budget (combined)</label>
          <div className="tag-grid">{BUDGETS.map(b => <button key={b} className={`tag ${budget===b?'selected':''}`} onClick={()=>setBudget(b)}>{b}</button>)}</div>
          <label>Location</label>
          <input type="text" placeholder="e.g. downtown Chicago, near campus..." value={location} onChange={e=>setLocation(e.target.value)} />
          <label>Exclude categories (optional)</label>
          <div className="tag-grid">{CATEGORIES.map(c => <button key={c} className={`tag ${excludedCats.includes(c)?'selected':''}`} onClick={()=>toggleCat(c)}>{c}</button>)}</div>
          {error && <p style={{color:'var(--danger)'}}>{error}</p>}
          <button className="btn" onClick={generateActivity} disabled={generating}>Reveal our quest →</button>
        </>}

        {stage === 'generating' && <div style={{textAlign:'center',padding:'24px 0'}}>
          <div className="beacon-wrap"><div className="beacon-ring"/><div className="beacon-ring"/><div className="beacon-dot"/></div>
          <h2>The quest is being forged...</h2>
          <div className="waiting-dots"><span/><span/><span/></div>
        </div>}

        {stage === 'countdown' && <div style={{textAlign:'center',padding:'16px 0'}}>
          <div className="beacon-wrap"><div className="beacon-ring"/><div className="beacon-ring"/><div className="beacon-dot"/></div>
          <h2>Your quest approaches</h2>
          <p>The beacon reveals your quest first. Watch it light up.</p>
          <div style={{fontSize:48,fontWeight:300,color:'var(--accent)',margin:'16px 0',letterSpacing:'-0.03em'}}>{countdown}</div>
          <div style={{background:'var(--surface2)',borderRadius:100,height:3,overflow:'hidden',marginBottom:8}}>
            <div style={{height:'100%',background:'var(--accent)',width:`${pct}%`,transition:'width 1s linear',borderRadius:100}}/>
          </div>
          <p style={{fontSize:12,marginTop:8}}>Revealing in {countdown}s</p>
        </div>}

        {stage === 'result' && <>
          <div className="step-label">Your quest</div>
          <div className="activity-card">
            <div className="activity-title">The adventure awaits</div>
            <div className="activity-body">{activity}</div>
          </div>
          <button className="btn btn-ghost" onClick={() => { setStageSync('prefs'); setActivitySync(''); setExcludedCats([]) }}>Seek another quest</button>
        </>}
      </div>
    </main>
  )
}
