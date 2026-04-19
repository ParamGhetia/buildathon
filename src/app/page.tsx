'use client'
export default function Home() {
  return (
    <main className="page">
      <div className="card" style={{textAlign:'center'}}>
        <div className="logo">Beacon</div>
        <div className="beacon-wrap">
          <div className="beacon-ring" />
          <div className="beacon-ring" />
          <div className="beacon-dot" />
        </div>
        <h1>Find your next adventure</h1>
        <p>Scan a beacon QR code to get started. Two people. One activity. Endless possibilities.</p>
      </div>
    </main>
  )
}
