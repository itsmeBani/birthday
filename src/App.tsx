import { Suspense, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { Canvas } from '@react-three/fiber'
import CakeScene from './Cake.tsx'
import { playHappyBirthday, type SongPlayback } from './happyBirthdaySong.ts'
import './App.css'

interface ConfettiPiece {
  id: number
  x: number
  w: number
  c: string
  dur: number
  delay: number
  spin: string
  shape: 'rect' | 'circle' | 'triangle'
}

const CONFETTI_COLORS = [
  '#ff4d6d',
  '#ff8fa3',
  '#ff7043',
  '#ffb454',
  '#f2c94c',
  '#ffe066',
  '#8ba454',
  '#4fb477',
  '#2ec4b6',
  '#5fb0c7',
  '#4d96ff',
  '#5c7cfa',
  '#a86bd8',
  '#d868c9',
  '#f4efd8',
]

const CONFETTI_SHAPES: ConfettiPiece['shape'][] = ['rect', 'rect', 'circle', 'triangle']

function makeConfetti(batch: number): ConfettiPiece[] {
  return Array.from({ length: 220 }, (_, i) => ({
    id: batch * 10000 + i,
    x: Math.random() * 100,
    w: 7 + Math.random() * 11,
    c: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
    dur: 2 + Math.random() * 1.8,
    delay: Math.random() * 0.6,
    spin: `${Math.round(360 + Math.random() * 540)}deg`,
    shape: CONFETTI_SHAPES[Math.floor(Math.random() * CONFETTI_SHAPES.length)],
  }))
}

type ModalId = 'envelope' | 'gift1' | 'gift2'

const MODAL_CONTENT: Record<ModalId, { eyebrow: string; body: string; sign: string }> = {
  envelope: {
    eyebrow: 'A note for you',
    body: 'Dear Russel, happy 24th birthday. Here’s to more matcha, more cake, and every good thing this year has waiting for you.',
    sign: 'With love, always.',
  },
  gift1: {
    eyebrow: 'You opened it',
    body: 'Inside this one: an extra candle, just in case one wish wasn’t enough.',
    sign: 'Make it count.',
  },
  gift2: {
    eyebrow: 'You opened it',
    body: 'Inside this one: a promise to celebrate you all year, not just today.',
    sign: 'Happy birthday.',
  },
}

// Approximate on-screen position of each 3D object at the default camera
// angle, used so its modal appears to fly out from that spot.
const MODAL_ORIGIN: Record<ModalId, { x: string; y: string }> = {
  envelope: { x: '25vw', y: '70vh' },
  gift1: { x: '74vw', y: '58vh' },
  gift2: { x: '87vw', y: '73vh' },
}

function App() {
  const candlesLit = true
  const [wishBatch, setWishBatch] = useState(0)
  const confetti = useMemo(() => makeConfetti(wishBatch), [wishBatch])
  const [isPlaying, setIsPlaying] = useState(false)
  const playbackRef = useRef<SongPlayback | null>(null)
  const [modal, setModal] = useState<ModalId | null>(null)
  const [envelopeOpen, setEnvelopeOpen] = useState(false)
  const [gift1Open, setGift1Open] = useState(false)
  const [gift2Open, setGift2Open] = useState(false)
  const [openPhotoId, setOpenPhotoId] = useState<string | null>(null)

  const OPEN_SETTERS: Record<ModalId, (v: boolean) => void> = {
    envelope: setEnvelopeOpen,
    gift1: setGift1Open,
    gift2: setGift2Open,
  }
  const OPEN_STATE: Record<ModalId, boolean> = {
    envelope: envelopeOpen,
    gift1: gift1Open,
    gift2: gift2Open,
  }

  const handleObjectClick = (id: ModalId) => {
    if (OPEN_STATE[id]) {
      setModal(id)
      return
    }
    OPEN_SETTERS[id](true)
    window.setTimeout(() => setModal(id), 550)
  }

  const closeModal = () => {
    if (modal) OPEN_SETTERS[modal](false)
    setModal(null)
  }

  useEffect(() => {
    const t = setTimeout(() => setWishBatch((b) => b + 1), 500)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    return () => playbackRef.current?.stop()
  }, [])

  const togglePhotoCard = (id: string) => {
    setOpenPhotoId((cur) => (cur === id ? null : id))
  }

  useEffect(() => {
    if (!openPhotoId) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenPhotoId(null)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [openPhotoId])

  const toggleSong = () => {
    if (isPlaying) {
      playbackRef.current?.stop()
      playbackRef.current = null
      setIsPlaying(false)
      return
    }
    setIsPlaying(true)
    playbackRef.current = playHappyBirthday(() => {
      playbackRef.current = null
      setIsPlaying(false)
    })
  }

  return (
    <div className="stage" data-photo-open={openPhotoId ? 'true' : undefined}>
      <Canvas
        shadows
        camera={{ position: [0, 4.7, 4.95], fov: 55  }}
        gl={{ alpha: true, antialias: true }}
        dpr={[1, 2]}
      >
        <Suspense fallback={null}>
          <CakeScene
            candlesLit={candlesLit}
            envelopeOpen={envelopeOpen}
            gift1Open={gift1Open}
            gift2Open={gift2Open}
            openPhotoId={openPhotoId}
            onEnvelopeClick={() => handleObjectClick('envelope')}
            onGiftClick={handleObjectClick}
            onPhotoClick={togglePhotoCard}
            onPhotoClose={() => setOpenPhotoId(null)}
          />
        </Suspense>
      </Canvas>

      <header className="header">
        <span className="eyebrow">Today&rsquo;s special</span>
        <h1 className="headline">
          Happy <em>Birthday</em>, Russel
        </h1>
        <p className="subhead">
          Wishing you the happiest 24th birthday! May this year bring you endless joy, laughter, beautiful memories, and all the wonderful things you deserve.
        </p>
      </header>

      {wishBatch > 0 && (
        <div className="confetti-layer" aria-hidden="true">
          {confetti.map((p) => (
            <span
              key={p.id}
              className="confetto"
              data-shape={p.shape}
              style={
                {
                  '--x': `${p.x}%`,
                  '--w': `${p.w}px`,
                  '--c': p.c,
                  '--dur': `${p.dur}s`,
                  '--delay': `${p.delay}s`,
                  '--spin': p.spin,
                } as CSSProperties
              }
            />
          ))}
        </div>
      )}

      <button
        type="button"
        className="song-tab"
        data-state={isPlaying ? 'playing' : 'idle'}
        onClick={toggleSong}
        aria-pressed={isPlaying}
      >
        <span className="song-tab-icon" aria-hidden="true">
          {isPlaying ? (
            <svg viewBox="0 0 16 16" width="14" height="14">
              <rect x="3" y="2" width="3.4" height="12" rx="1" fill="currentColor" />
              <rect x="9.6" y="2" width="3.4" height="12" rx="1" fill="currentColor" />
            </svg>
          ) : (
            <svg viewBox="0 0 16 16" width="14" height="14">
              <path d="M4 2.5v11l10-5.5-10-5.5z" fill="currentColor" />
            </svg>
          )}
        </span>
        {isPlaying ? 'Playing Happy Birthday' : 'Play Happy Birthday'}
      </button>

      {openPhotoId && (
        <button
          type="button"
          className="photo-zoom-close"
          onClick={() => setOpenPhotoId(null)}
          aria-label="Put the photos away"
        >
          ×
        </button>
      )}

      {modal && (
        <div className="modal-backdrop" onClick={closeModal}>
          <div
            className="modal-card"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
            style={
              {
                '--ox': MODAL_ORIGIN[modal].x,
                '--oy': MODAL_ORIGIN[modal].y,
              } as CSSProperties
            }
          >
            <button
              type="button"
              className="modal-close"
              onClick={closeModal}
              aria-label="Close"
            >
              ×
            </button>
            <span className="modal-eyebrow">{MODAL_CONTENT[modal].eyebrow}</span>
            <p className="modal-body">{MODAL_CONTENT[modal].body}</p>
            <p className="modal-sign">{MODAL_CONTENT[modal].sign}</p>
          </div>
        </div>
      )}
    </div>
  )
}

export default App