'use client'
import { useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const PERSONALITIES = ['INTJ','INTP','ENTJ','ENTP','INFJ','INFP','ENFJ','ENFP','ISTJ','ISFJ','ESTJ','ESFJ','ISTP','ISFP','ESTP','ESFP']
const INTERESTS = ['Music','Art','Food','Sports','Outdoors','Gaming','Movies','Reading','Travel','Fitness','Cooking','Dancing','Comedy','Tech','Fashion']

export default function BeaconPage() {
  const params = useParams()
  const beaconId = params.id as string
  const router = useRouter()
  const [name, setName] = useState('')
  const [personality, setPersonality] = useState('')
  const [interests, setInterests] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  function toggleInterest(i: string) {
    setInterests(prev => prev.includes(i) ? prev.filter(x => x !== i) : prev.length < 5 ? [...prev, i] : prev)
  }

  async function handleJoin() {
    if (!name.trim() || !personality) { setError('Please enter your name and pick a personality type.'); return }
    setLoading(true); setError('')
    try {
      const { data: existing } = await supabase.from('sessions').select('*').eq('beacon_id', beaconId).eq('status', 'waiting').order('created_at', { ascending: false }).limit(1).single()
      const profile = { name: name.trim(), personality, interests }
      if (existing) {
        await supabase.from('sessions').update({ user_b: profile, status: 'matched' }).eq('id', existing.id)
        router.push(`/session/${existing.id}?user=b`)
      } else {
        const { data: session, error: insertErr } = await supabase.from('sessions').insert({ beacon_id: beaconId, user_a: profile, status: 'waiting' }).select().single()
        if (insertErr) throw insertErr
        router.push(`/session/${session.id}?user=a`)
      }
    } catch (e: any) { setError(e.message || 'Something went wrong.'); setLoading(false) }
  }

  return (
    <main className="page">
      <div className="page-bg"><div className="blob1"/><div className="blob2"/></div>
      <div className="card">
        <div className="logo">Beacon</div>
        <div className="beacon-wrap">
          <div className="beacon-ring" /><div className="beacon-ring" /><div className="beacon-dot" />
        </div>
        <div className="step-label">Step 1 of 2</div>
        <h2>Who are you?</h2>
        <p>Every quest needs a hero. Tell us who you are.</p>
        <label>Your name</label>
        <input type="text" placeholder="e.g. Alex" value={name} onChange={e => setName(e.target.value)} />
        <label>16 personalities type</label>
        <select value={personality} onChange={e => setPersonality(e.target.value)}>
          <option value="">Select your type...</option>
          {PERSONALITIES.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <label>Interests (pick up to 5)</label>
        <div className="tag-grid">
          {INTERESTS.map(i => <button key={i} className={`tag ${interests.includes(i) ? 'selected' : ''}`} onClick={() => toggleInterest(i)}>{i}</button>)}
        </div>
        {error && <p style={{color:'var(--danger)',marginBottom:16}}>{error}</p>}
        <button className="btn" onClick={handleJoin} disabled={loading}>{loading ? 'Joining...' : 'Answer the call →'}</button>
      </div>
    </main>
  )
}
