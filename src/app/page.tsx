'use client'
export default function Home() {
  return (
    <main className="page">
      <div className="page-bg"><div className="blob1"/><div className="blob2"/></div>
      <div className="card" style={{textAlign:'center'}}>
        <div className="logo">Beacon</div>
        <div className="beacon-wrap">
          <div className="beacon-ring" />
          <div className="beacon-ring" />
          <div className="beacon-dot" />
        </div>
        <h1>The quest begins here</h1>
        <p>A beacon calls. Two adventurers answer. One shared experience awaits.</p>
      </div>
    </main>
  )
}
