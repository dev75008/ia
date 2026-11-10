import { memo, useState } from 'react'

function CardMedia({ image, title, translated, eager = false }) {
  const [broken, setBroken] = useState(false)
  const show = Boolean(image) && !broken

  return (
    <div className={`card-media${show ? '' : ' is-fallback'}`}>
      {show ? (
        <img
          src={image}
          alt=""
          loading={eager ? 'eager' : 'lazy'}
          decoding="async"
          fetchPriority={eager ? 'high' : 'auto'}
          referrerPolicy="no-referrer"
          onError={() => setBroken(true)}
        />
      ) : (
        <span className="media-glyph" aria-hidden="true">{title.slice(0, 1)}</span>
      )}
      {translated ? <span className="lang-flag">traduit</span> : null}
    </div>
  )
}

export default memo(CardMedia)
