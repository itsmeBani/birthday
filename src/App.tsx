import { Suspense, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { Canvas } from '@react-three/fiber'
import CakeScene from './Cake.tsx'
import { playHappyBirthday, type SongPlayback } from './happyBirthdaySong.ts'
import giftJersey from './assets/1789050427380.jpg'
import giftJacket from './assets/1789050442492.jpg'
import photoCatPlush from './assets/photo-cat-plush.png'
import photoPark1 from './assets/photo-park-1.jpg'
import photoPark2 from './assets/photo-park-2.jpg'
import photoSelfie1 from './assets/photo-selfie-1.jpg'
import photoSelfie2 from './assets/photo-selfie-2.jpg'
import photoCafe from './assets/photo-cafe.jpg'
import './App.css'

const SCENE_IMAGE_URLS = [photoCatPlush, photoPark1, photoPark2, photoSelfie1, photoSelfie2, photoCafe]

interface ConfettiPiece {
  id: number
  w: number
  c: string
  delay: number
  rotation: number
  shape: 'rect' | 'circle' | 'triangle'
}

interface ModalConfettiPiece extends ConfettiPiece {
  x: number
  y: number
  dx: number
  dy: number
}

const CONFETTI_COLORS = [
  '#ff4d6d', '#ff8fa3', '#ff7043', '#ffb454', '#f2c94c', '#ffe066', '#8ba454',
  '#4fb477', '#2ec4b6', '#5fb0c7', '#4d96ff', '#5c7cfa', '#a86bd8', '#d868c9', '#f4efd8',
]

const CONFETTI_SHAPES: ConfettiPiece['shape'][] = ['rect', 'rect', 'circle', 'triangle']

function makeModalConfetti(batch: number): ModalConfettiPiece[] {
  return Array.from({ length: 96 }, (_, i) => {
    const angle = Math.random() * Math.PI * 2
    const distance = 58 + Math.random() * 130
    return {
      id: batch * 1000 + i,
      // A tight cluster at the center makes the animation read as an explosion,
      // rather than individual pieces simply drifting down from the top.
      x: 38 + Math.random() * 24,
      y: 30 + Math.random() * 25,
      dx: Math.cos(angle) * distance,
      dy: Math.sin(angle) * distance * 0.72,
      w: 4 + Math.random() * 9,
      c: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
      delay: Math.random() * 0.2,
      rotation: Math.round(Math.random() * 180),
      shape: CONFETTI_SHAPES[Math.floor(Math.random() * CONFETTI_SHAPES.length)],
    }
  })
}

interface PageConfettiPiece {
  id: number
  x: number
  w: number
  c: string
  dur: number
  delay: number
  spin: string
  shape: ConfettiPiece['shape']
}

function makePageConfetti(batch: number): PageConfettiPiece[] {
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

type GiftDetails = {
  sender: string
  senderInitials: string
  note: string
  recipient: string
  size: string
  order: string
}

const MODAL_CONTENT: Record<ModalId, {
  eyebrow: string
  image?: string
  body: string
  sign: string
  deliveryDate?: string
  giftDetails?: GiftDetails
}> = {
  envelope: {
    eyebrow: 'A note for you',
    body: 'Happy birthday, beautiful. I hope today feels easy, happy, and full of the people and little things you love most. You deserve good days, big dreams, and all the happiness coming your way. I’m really lucky to know you.',
    sign: 'Yun lang. Bani out. Hahahah.',
  },
  gift1: {
    eyebrow: 'You opened it',
    image: giftJersey,
    body: 'A GMMTV jersey',
    sign: 'Worth the wait.',
    deliveryDate: 'September 18',
    giftDetails: {
      sender: 'Bani F.',
      senderInitials: 'BF',
      note: 'Gift ko HAAHAHHAHA',
      recipient: 'Aston · 17',
      size: 'Medium',
      order: 'GM-48210',
    },
  },
  gift2: {
    eyebrow: 'You opened it',
    image: giftJacket,
    body: 'GMMTV  jacket.',
    sign: 'Worth the wait.',
    deliveryDate: 'September 18',
    giftDetails: {
      sender: 'Bani F.',
      senderInitials: 'BF',
      note: 'Gift ko HAAHAHHAHA',
      recipient: 'Jacket',
      size: 'Large',
      order: 'GM-48211',
    },
  },
}

function GiftIcon() {
  return (
    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="9" width="18" height="11" rx="1.5" />
      <path d="M3 13h18" />
      <path d="M12 9v11" />
      <path d="M7.5 9C6 9 5 7.8 5 6.5S6 4 7.5 4C9.5 4 12 6 12 9" />
      <path d="M16.5 9C18 9 19 7.8 19 6.5S18 4 16.5 4C14.5 4 12 6 12 9" />
    </svg>
  )
}

function TruckIcon() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1.5" y="7" width="13" height="9" />
      <path d="M14.5 10h4l3.5 3.2V16h-7.5z" />
      <circle cx="6" cy="18.5" r="1.6" />
      <circle cx="17.5" cy="18.5" r="1.6" />
    </svg>
  )
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
  const [modelReady, setModelReady] = useState(false)
  const [sceneImagesReady, setSceneImagesReady] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const playbackRef = useRef<SongPlayback | null>(null)
  const [modal, setModal] = useState<ModalId | null>(null)
  const [envelopeOpen, setEnvelopeOpen] = useState(false)
  const [gift1Open, setGift1Open] = useState(false)
  const [gift2Open, setGift2Open] = useState(false)
  const [openPhotoId, setOpenPhotoId] = useState<string | null>(null)
  const [giftModalBatch, setGiftModalBatch] = useState(0)
  const modalConfetti = useMemo(() => (modal?.startsWith('gift') ? makeModalConfetti(giftModalBatch) : []), [modal, giftModalBatch])
  const [pageConfettiBatch, setPageConfettiBatch] = useState(0)
  const pageConfetti = useMemo(() => makePageConfetti(pageConfettiBatch), [pageConfettiBatch])

  useEffect(() => {
    let cancelled = false
    const preload = (src: string) => new Promise<void>((resolve) => {
      const image = new Image()
      image.onload = () => resolve()
      image.onerror = () => resolve() // Never leave the experience behind a loader for one missing image.
      image.src = src
      if (image.complete) resolve()
    })
    Promise.all(SCENE_IMAGE_URLS.map(preload)).then(() => {
      if (!cancelled) setSceneImagesReady(true)
    })
    return () => { cancelled = true }
  }, [])

  const sceneReady = modelReady && sceneImagesReady

  // Greet with a burst once the scene has actually finished loading, rather than on a blind
  // timer — firing while the loader overlay still covers the screen would waste the moment.
  useEffect(() => {
    if (sceneReady) setPageConfettiBatch((b) => b + 1)
  }, [sceneReady])

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
    window.setTimeout(() => {
      if (id.startsWith('gift')) setGiftModalBatch((batch) => batch + 1)
      setModal(id)
    }, 550)
  }

  const closeModal = () => {
    if (modal) OPEN_SETTERS[modal](false)
    setModal(null)
  }

  useEffect(() => {
    return () => playbackRef.current?.stop()
  }, [])

  const togglePhotoCard = (id: string) => {
    setOpenPhotoId((cur) => {
      return cur === id ? null : id
    })
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
        camera={{ position: [0, 4.7, 4.95], fov: 60  }}
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
            onModelReady={() => setModelReady(true)}
          />
        </Suspense>
      </Canvas>

      {!sceneReady && (
        <div className="scene-loader" role="status" aria-live="polite" aria-label="Loading birthday surprise">
          <div className="scene-loader-mark" aria-hidden="true"><span /><span /><span /></div>
          <p>Preparing your birthday surprise</p>
        </div>
      )}

      <header className="header">
        <span className="eyebrow">Today&rsquo;s special</span>
        <h1 className="headline">
          Happy <em>Birthday</em>, Russel
        </h1>
        <p className="subhead">
          Wishing you the happiest 24th birthday! May this year bring you endless joy, laughter, beautiful memories, and all the wonderful things you deserve.
        </p>
      </header>

      {pageConfettiBatch > 0 && (
        <div className="confetti-layer" aria-hidden="true" key={pageConfettiBatch}>
          {pageConfetti.map((p) => (
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
            className={`modal-card ${modal === 'envelope' ? 'modal-card--letter' : ''}`}
            role="dialog"
            aria-modal="true"
            onClick={modal === 'envelope' ? closeModal : (e) => e.stopPropagation()}
            style={
              {
                '--ox': MODAL_ORIGIN[modal].x,
                '--oy': MODAL_ORIGIN[modal].y,
              } as CSSProperties
            }
          >
            {modalConfetti.length > 0 && (
              <div className="modal-confetti" aria-hidden="true" key={modal}>
                {modalConfetti.map((piece) => (
                  <span
                    key={piece.id}
                    data-shape={piece.shape}
                    style={{
                      '--x': `${piece.x}%`,
                      '--y': `${piece.y}%`,
                      '--dx': `${piece.dx}px`,
                      '--dy': `${piece.dy}px`,
                      '--w': `${piece.w}px`,
                      '--c': piece.c,
                      '--delay': `${piece.delay}s`,
                      '--r': `${piece.rotation}deg`,
                    } as CSSProperties}
                  />
                ))}
              </div>
            )}
            {modal !== 'envelope' && <button type="button" className="modal-close" onClick={closeModal} aria-label="Close">×</button>}
            {modal === 'envelope' ? (
              <article className="birthday-letter">
                <span className="birthday-letter-stamp">For Russel</span>
                <span className="birthday-letter-kicker">A birthday letter</span>
                <h2>Happy birthday!</h2>
                <p>{MODAL_CONTENT.envelope.body}</p>
                <p className="birthday-letter-sign">{MODAL_CONTENT.envelope.sign}</p>
              </article>
            ) : (
              <>
                <span className="modal-eyebrow-chip"><GiftIcon />{MODAL_CONTENT[modal].eyebrow}</span>
                <div className="modal-product"><img className="modal-gift-image" src={MODAL_CONTENT[modal].image} alt="" /></div>
                <p className="modal-body">{MODAL_CONTENT[modal].body}</p>
                <div className="modal-sender-note">
                  <span className="modal-avatar">{MODAL_CONTENT[modal].giftDetails!.senderInitials}</span>
                  <p><small>From {MODAL_CONTENT[modal].giftDetails!.sender}</small>{MODAL_CONTENT[modal].giftDetails!.note}</p>
                </div>
                <dl className="modal-order-details">
                  <div><dt>Name and number</dt><dd>{MODAL_CONTENT[modal].giftDetails!.recipient}</dd></div>
                  <div><dt>Size</dt><dd>{MODAL_CONTENT[modal].giftDetails!.size}</dd></div>
                </dl>
                <div className="modal-delivery-badge">
                  <span className="modal-delivery-icon" aria-hidden="true"><TruckIcon /></span>
                  <span className="modal-delivery-text"><strong>Estimated delivery</strong><b>{MODAL_CONTENT[modal].deliveryDate}</b></span>
                  <div className="modal-delivery-progress" aria-label="Packed and shipped; delivery pending"><span /><span /><span /></div>
                  <div className="modal-delivery-steps" aria-hidden="true"><span>Packed</span><span>Shipped</span><span>Delivered</span></div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default App
