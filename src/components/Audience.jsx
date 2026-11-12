import { useEffect, useState } from 'react'

const COUNTER = 'https://abacus.jasoncameron.dev'
const GEO = 'https://ipwho.is/'

function flagFor(code) {
  if (!code || code.length !== 2) return ''
  return String.fromCodePoint(...[...code.toUpperCase()].map((letter) => 127397 + letter.charCodeAt(0)))
}

// Bandeau d'audience : le pays de la connexion (géolocalisation IP publique) et
// un compteur global de visites. Aucun cookie, aucune donnée conservée côté site.
export default function Audience() {
  const [geo, setGeo] = useState(null)
  const [visits, setVisits] = useState(null)

  useEffect(() => {
    let cancelled = false

    const loadCountry = async () => {
      try {
        const cached = sessionStorage.getItem('ianews-country')
        if (cached) {
          const parsed = JSON.parse(cached)
          if (!cancelled) setGeo(parsed)
          return
        }
      } catch {
        // sessionStorage indisponible
      }
      try {
        const response = await fetch(GEO, { signal: AbortSignal.timeout(8000) })
        if (!response.ok) return
        const data = await response.json()
        if (data?.success === false || !data?.country_code) return
        const country = { name: data.country, code: data.country_code }
        try { sessionStorage.setItem('ianews-country', JSON.stringify(country)) } catch { /* session */ }
        if (!cancelled) setGeo(country)
      } catch {
        // géolocalisation indisponible
      }
    }

    const loadVisits = async () => {
      try {
        const counted = sessionStorage.getItem('ianews-visit')
        const endpoint = counted ? `${COUNTER}/get/ianews/visits` : `${COUNTER}/hit/ianews/visits`
        const response = await fetch(endpoint, { signal: AbortSignal.timeout(8000) })
        if (!response.ok) return
        const data = await response.json()
        if (typeof data?.value !== 'number') return
        if (!counted) {
          try { sessionStorage.setItem('ianews-visit', '1') } catch { /* session */ }
        }
        if (!cancelled) setVisits(data.value)
      } catch {
        // compteur indisponible
      }
    }

    loadCountry()
    loadVisits()
    return () => { cancelled = true }
  }, [])

  if (!geo && visits === null) return null

  return (
    <p className="audience">
      <span className="audience-live">
        <span className="live-dot is-on" aria-hidden="true" />
        En direct
      </span>
      {geo ? <span className="audience-country"><span aria-hidden="true">{flagFor(geo.code)}</span> {geo.name}</span> : null}
      {visits !== null ? (
        <span title="Compteur global de visites, sans cookie">
          <b>{visits.toLocaleString('fr-FR')}</b> visites
        </span>
      ) : null}
    </p>
  )
}
