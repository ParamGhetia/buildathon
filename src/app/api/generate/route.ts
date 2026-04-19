import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const { userA, userB, time, budget, location, excludedCategories, availableCategories } = await req.json()
    const prompt = `Two people just matched on a social beacon app.
Person A: ${userA.name}, ${userA.personality}, likes: ${userA.interests?.join(', ')||'various things'}
Person B: ${userB.name}, ${userB.personality}, likes: ${userB.interests?.join(', ')||'various things'}
Time: ${time}, Budget: ${budget}, Location: ${location}, Categories available: ${availableCategories.join(', ')}

Give one activity in a very short sentence like "play mini-golf at the nearby ranges". Be specific and fun. No preamble, just the activity.`

    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.GROQ_API_KEY}` },
      body: JSON.stringify({ model: 'llama-3.3-70b-versatile', max_tokens: 80, messages: [{ role: 'user', content: prompt }] }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error?.message||'Groq error')
    return NextResponse.json({ activity: data.choices[0].message.content.trim() })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
