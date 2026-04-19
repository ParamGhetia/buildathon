import type { Metadata } from 'next'
import './globals.css'
export const metadata: Metadata = { title: 'Beacon', description: 'Find your next adventure' }
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
