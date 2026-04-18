import { useEffect, useState } from 'react'

export default function App() {
  const [status, setStatus] = useState<string>('checking…')

  useEffect(() => {
    fetch('/api/health')
      .then((r) => r.json())
      .then((d: { status: string }) => setStatus(d.status))
      .catch(() => setStatus('unreachable'))
  }, [])

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: 32 }}>
      <h1>HackerManChat</h1>
      <p>api: {status}</p>
    </main>
  )
}
