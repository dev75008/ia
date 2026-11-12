import { useCallback, useEffect, useState } from 'react'

const SNAPSHOT_URL = `${import.meta.env.BASE_URL}feed-snapshot.json`
const POLL_MS = 15 * 60 * 1000

// Charge l'édition statique puis la rafraîchit toutes les cinq minutes. Le
// navigateur ne contacte jamais les éditeurs : tout vient du même snapshot.
export function useSnapshot() {
  const [snapshot, setSnapshot] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async (foreground = false) => {
    if (foreground) setRefreshing(true)
    try {
      const response = await fetch(`${SNAPSHOT_URL}?v=${Date.now()}`, { cache: 'no-store' })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const data = await response.json()
      if (!Array.isArray(data.articles)) throw new Error('snapshot invalide')
      setSnapshot(data)
      setError('')
    } catch (cause) {
      setError(cause.message || 'snapshot indisponible')
    } finally {
      setLoading(false)
      if (foreground) setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    load()
    const timer = window.setInterval(() => load(), POLL_MS)
    return () => window.clearInterval(timer)
  }, [load])

  return { snapshot, error, loading, refreshing, reload: () => load(true) }
}
