import { useEffect, useRef } from 'react'

// Compteur animé en requestAnimationFrame : même rendu que GSAP pour un coût
// minuscule, et valeur finale immédiate si l'utilisateur réduit le mouvement.
export default function CountUp({ value }) {
  const ref = useRef(null)

  useEffect(() => {
    const node = ref.current
    if (!node) return undefined
    const target = Number(value) || 0
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      node.textContent = target.toLocaleString('fr-FR')
      return undefined
    }
    let frame = 0
    const started = performance.now()
    const duration = 900
    const tick = (now) => {
      const progress = Math.min(1, (now - started) / duration)
      const eased = 1 - (1 - progress) ** 3
      node.textContent = Math.round(target * eased).toLocaleString('fr-FR')
      if (progress < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [value])

  return <span ref={ref}>0</span>
}
