import { useEffect, useState } from 'react'
import { relativeDate } from '../lib/format.js'

// Le point « en direct » ne s'allume que si l'édition a moins de 45 minutes : le
// cron GitHub Actions dérive souvent au-delà, et une pastille verte sur des
// données vieilles de six heures serait un mensonge plus qu'un ornement.
const LIVE_WINDOW_MS = 45 * 60 * 1000

// Bandeau du pied de page : l'âge de l'édition courante, recalculé chaque minute.
// Entièrement local : aucun appel réseau, donc aucune adresse IP transmise, aucun
// cookie et rien à consentir. (Un pays déduit de l'IP a été écarté : ipwho.is
// répond 429 dès quelques requêtes, et une mesure d'audience tierce exigerait
// un consentement que ce site n'a pas.)
export default function Audience({ updatedAt }) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    setNow(Date.now())
    const timer = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(timer)
  }, [updatedAt])

  const age = now - new Date(updatedAt).getTime()
  const live = Number.isFinite(age) && age >= 0 && age < LIVE_WINDOW_MS

  return (
    <p className="audience">
      {live ? (
        <span className="audience-live">
          <span className="live-dot is-on" aria-hidden="true" />
          En direct
        </span>
      ) : null}
      <span className="audience-edition">édition {relativeDate(updatedAt)}</span>
    </p>
  )
}
