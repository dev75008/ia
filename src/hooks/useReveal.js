import { useLayoutEffect } from 'react'

// Révélation au défilement sans bibliothèque : l'état masqué est posé avant la
// première peinture (pas de flash), puis chaque section est révélée une fois
// lorsqu'elle entre dans le viewport. Sans JS, rien n'est masqué.
export function useReveal() {
  useLayoutEffect(() => {
    const nodes = Array.from(document.querySelectorAll('.reveal'))
    if (!nodes.length) return undefined
    if (!('IntersectionObserver' in window) || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      nodes.forEach((node) => node.classList.add('is-revealed'))
      return undefined
    }
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue
        entry.target.classList.add('is-revealed')
        observer.unobserve(entry.target)
      }
    }, { rootMargin: '0px 0px -12% 0px', threshold: 0.01 })
    nodes.forEach((node) => {
      node.classList.add('is-pending')
      observer.observe(node)
    })
    return () => observer.disconnect()
  }, [])
}
