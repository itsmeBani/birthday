import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'

const CSS = `
.gb-scene{position:relative;display:flex;align-items:center;justify-content:center;user-select:none;touch-action:none;cursor:grab;outline:none}
.gb-scene[data-drag="1"]{cursor:grabbing}
.gb-scene:focus-visible{outline:2px solid currentColor;outline-offset:6px;border-radius:12px}
.gb-lid{transform:var(--gb-lid-closed);transition:transform var(--gb-dur) cubic-bezier(.22,.9,.28,1)}
.gb-open .gb-lid{transform:var(--gb-lid-open)}
.gb-gift{transform:var(--gb-gift-closed);opacity:0;transition:transform var(--gb-dur) cubic-bezier(.24,.86,.32,1) .16s,opacity .5s ease .16s}
.gb-open .gb-gift{transform:var(--gb-gift-open);opacity:1}
.gb-shadow{transform:var(--gb-shadow-closed);filter:blur(var(--gb-shadow-blur-closed));opacity:var(--gb-shadow-op-closed);transition:transform var(--gb-dur) ease,filter var(--gb-dur) ease,opacity var(--gb-dur) ease}
.gb-open .gb-shadow{transform:var(--gb-shadow-open);filter:blur(var(--gb-shadow-blur-open));opacity:var(--gb-shadow-op-open)}
.gb-lid-shadow{transform:var(--gb-lidshadow-closed);filter:blur(var(--gb-lidshadow-blur-closed));opacity:0;transition:transform var(--gb-dur) ease,filter var(--gb-dur) ease,opacity var(--gb-dur) ease}
.gb-open .gb-lid-shadow{transform:var(--gb-lidshadow-open);filter:blur(var(--gb-lidshadow-blur-open));opacity:var(--gb-lidshadow-op-open)}
@media (prefers-reduced-motion: reduce){.gb-lid,.gb-gift,.gb-shadow,.gb-lid-shadow{transition-duration:.01ms}}
`

let styleInjected = false
function useGiftBoxStyles() {
  useEffect(() => {
    if (styleInjected || typeof document === 'undefined') return
    styleInjected = true
    const el = document.createElement('style')
    el.setAttribute('data-giftbox', '')
    el.textContent = CSS
    document.head.appendChild(el)
  }, [])
}

function clamp8(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)))
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}

function rgbToHex([r, g, b]: [number, number, number]): string {
  return `#${[r, g, b].map((v) => clamp8(v).toString(16).padStart(2, '0')).join('')}`
}

// amt > 0 lightens toward white, amt < 0 darkens toward black
function shade(hex: string, amt: number): string {
  const [r, g, b] = hexToRgb(hex)
  if (amt >= 0) return rgbToHex([r + (255 - r) * amt, g + (255 - g) * amt, b + (255 - b) * amt])
  return rgbToHex([r * (1 + amt), g * (1 + amt), b * (1 + amt)])
}

export interface GiftBoxColorSpec {
  lidTop: string
  lidFront: string
  lidSide: string
  boxFront: string
  boxRight: string
  boxLeft: string
  outerBottom: string
  innerWallTop: string
  innerWallBottom: string
  ribbonFace: string
  ribbonFront: string
  ribbonSide: string
}

const giftBoxPresets: Record<'slate' | 'sage', GiftBoxColorSpec> = {
  slate: {
    lidTop: '#BFDBDC',
    lidFront: '#AFC9CA',
    lidSide: '#9DB7B9',
    boxFront: '#86999A',
    boxRight: '#A0B8BA',
    boxLeft: '#728485',
    outerBottom: '#5E6E6F',
    innerWallTop: '#5A6C6D',
    innerWallBottom: '#465555',
    ribbonFace: '#E7E19E',
    ribbonFront: '#CFC98A',
    ribbonSide: '#B4AE71',
  },
  sage: {
    lidTop: '#D9DBAF',
    lidFront: '#C7CA9C',
    lidSide: '#B4B786',
    boxFront: '#8F9074',
    boxRight: '#BEC28C',
    boxLeft: '#787A5F',
    outerBottom: '#666852',
    innerWallTop: '#5E6049',
    innerWallBottom: '#4A4C39',
    ribbonFace: '#F2F0E4',
    ribbonFront: '#E5E2D2',
    ribbonSide: '#CFCBB8',
  },
}

function derivePalette(spec: GiftBoxColorSpec) {
  return {
    lidTop: spec.lidTop,
    lidFront: spec.lidFront,
    lidBack: shade(spec.lidFront, -0.14),
    lidRight: spec.lidSide,
    lidLeft: shade(spec.lidSide, -0.08),
    lidUnder: shade(spec.lidSide, -0.6),
    boxFront: spec.boxFront,
    boxBack: shade(spec.boxLeft, -0.05),
    boxRight: spec.boxRight,
    boxLeft: spec.boxLeft,
    outerBottom: spec.outerBottom,
    innerWallTop: spec.innerWallTop,
    innerWallBottom: spec.innerWallBottom,
    innerFloor: shade(spec.innerWallBottom, -0.08),
    ribbonFront: spec.ribbonFront,
    ribbonBack: shade(spec.ribbonFront, -0.08),
    ribbonRight: shade(spec.ribbonSide, 0.1),
    ribbonLeft: spec.ribbonSide,
    ribbonInnerFrontBack: shade(spec.ribbonFront, -0.25),
    ribbonInnerSides: shade(spec.ribbonSide, -0.25),
    ribbonFloor: shade(spec.ribbonSide, -0.35),
    ribbonFace: spec.ribbonFace,
  }
}

type GiftBoxPalette = ReturnType<typeof derivePalette>

const FACE: CSSProperties = { position: 'absolute', boxSizing: 'border-box', backfaceVisibility: 'hidden' }

export interface GiftBoxProps {
  size?: number
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
  preset?: keyof typeof giftBoxPresets
  colors?: Partial<GiftBoxColorSpec>
  restingLid?: 'seated' | 'askew'
  draggable?: boolean
  initialRotation?: { x: number; y: number }
  className?: string
  style?: CSSProperties
  children?: ReactNode
}

export default function GiftBox({
  size = 200,
  open,
  defaultOpen = false,
  onOpenChange,
  preset = 'slate',
  colors,
  restingLid = 'seated',
  draggable = true,
  initialRotation = { x: -18, y: -34 },
  className = '',
  style,
  children,
}: GiftBoxProps) {
  useGiftBoxStyles()

  const c: GiftBoxPalette = useMemo(
    () => derivePalette({ ...giftBoxPresets[preset], ...colors }),
    [preset, colors],
  )

  const isControlled = open !== undefined
  const [innerOpen, setInnerOpen] = useState(defaultOpen)
  const isOpen = isControlled ? open : innerOpen

  const toggle = useCallback(() => {
    const next = !isOpen
    if (!isControlled) setInnerOpen(next)
    onOpenChange?.(next)
  }, [isOpen, isControlled, onOpenChange])

  const [rot, setRot] = useState(initialRotation)
  const [dragging, setDragging] = useState(false)
  const drag = useRef({ active: false, x: 0, y: 0, moved: 0 })

  const W = size
  const H = Math.round(size * 0.8)
  const LW = Math.round(size * 1.08)
  const LH = Math.round(size * 0.24)
  const rw = Math.round(size * 0.16)
  const radius = Math.max(2, Math.round(size * 0.014))
  const hW = W / 2
  const hH = H / 2
  const hLW = LW / 2
  const hLH = LH / 2
  const lidY = -hH + hLH
  const giftSize = Math.round(size * 0.27)

  const wall: CSSProperties = { ...FACE, left: -hW, top: -hH, width: W, height: H, borderRadius: radius }
  const slab: CSSProperties = { ...FACE, left: -hW, top: -hW, width: W, height: W, borderRadius: radius }
  const lidWall: CSSProperties = { ...FACE, left: -hLW, top: -hLH, width: LW, height: LH, borderRadius: radius }
  const lidSlab: CSSProperties = { ...FACE, left: -hLW, top: -hLW, width: LW, height: LW, borderRadius: radius }

  // Diffuse falloff (lighter top edge, darker bottom) plus an optional dark
  // band at the very top simulating occlusion where the lid overhangs a wall.
  const faceBg = (base: string, fallOff: number, overhang = false) => {
    const light = shade(base, 0.07)
    const dark = shade(base, -fallOff)
    const diffuse = `linear-gradient(180deg, ${light} 0%, ${base} 42%, ${dark} 100%)`
    if (!overhang) return diffuse
    const ao = `linear-gradient(180deg, rgba(24,18,14,0.32) 0%, rgba(24,18,14,0) 18%)`
    return `${ao}, ${diffuse}`
  }

  const faceShadow = (strong = false) => {
    const spread = Math.max(2, size * (strong ? 0.09 : 0.05))
    return [
      `inset 0 1px 0 rgba(255,255,255,0.32)`,
      `inset 0 -${Math.round(spread * 1.5)}px ${Math.round(spread * 2.1)}px -${Math.round(spread * 0.7)}px rgba(18,12,9,${strong ? 0.45 : 0.28})`,
    ].join(', ')
  }

  const innerWallBg = `linear-gradient(180deg, ${shade(c.innerWallTop, 0.04)} 0%, ${c.innerWallTop} 30%, ${c.innerWallBottom} 100%)`

  const ribbonBand = (base: string, axis: 'v' | 'h', width: number): CSSProperties => {
    const light = shade(base, 0.2)
    const dark = shade(base, -0.16)
    const stripe =
      axis === 'v'
        ? `linear-gradient(90deg, ${dark} 0%, ${light} 50%, ${dark} 100%)`
        : `linear-gradient(180deg, ${dark} 0%, ${light} 50%, ${dark} 100%)`
    const common: CSSProperties = {
      position: 'absolute',
      background: stripe,
      transform: `translateZ(${axis === 'h' ? 2.6 : 2}px)`,
      borderRadius: Math.max(1, radius - 1),
      boxShadow: `0 ${Math.max(1, radius)}px ${Math.max(3, radius * 2.4)}px rgba(18,12,9,0.28)`,
    }
    return axis === 'v'
      ? { ...common, left: '50%', top: 0, width, height: '100%', marginLeft: -width / 2 }
      : { ...common, top: '50%', left: 0, height: width, width: '100%', marginTop: -width / 2 }
  }

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!draggable) return
    drag.current = { active: true, x: e.clientX, y: e.clientY, moved: 0 }
    setDragging(true)
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d.active) return
    const dx = e.clientX - d.x
    const dy = e.clientY - d.y
    d.x = e.clientX
    d.y = e.clientY
    d.moved += Math.abs(dx) + Math.abs(dy)
    setRot((r) => ({
      x: Math.max(-70, Math.min(45, r.x - dy * 0.3)),
      y: r.y + dx * 0.4,
    }))
  }

  const onPointerUp = () => {
    const moved = drag.current.moved
    drag.current.active = false
    setDragging(false)
    if (moved < 6) toggle()
  }

  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      toggle()
    }
  }

  const askew = restingLid === 'askew'
  const lidClosedTransform = askew
    ? `translateY(${lidY}px) translateX(${size * 0.02}px) rotateZ(-8deg) rotateX(4deg)`
    : `translateY(${lidY}px)`
  const lidOpenTransform = `translateY(${lidY - H * 0.78}px) translateZ(${size * 0.13}px) rotateZ(-19deg) rotateX(8deg)`

  const shadowW = W * 1.32
  const shadowH = W * 0.5
  const shadowOffsetX = size * 0.05
  const shadowOffsetY = size * 0.07
  const shadowBaseTransform = `translateX(${shadowOffsetX}px) translateY(${shadowOffsetY}px) rotateX(90deg) translateZ(${-hH - size * 0.01}px)`
  const shadowOpenTransform = `translateX(${shadowOffsetX * 1.3}px) translateY(${shadowOffsetY * 1.3}px) rotateX(90deg) translateZ(${-hH - size * 0.01}px) scale(1.22)`

  const lidShadowW = shadowW * 0.5
  const lidShadowH = shadowH * 0.55
  const lidShadowClosedTransform = `translateX(${shadowOffsetX}px) translateY(${shadowOffsetY}px) rotateX(90deg) translateZ(${-hH - size * 0.01}px) scale(0.6)`
  const lidShadowOpenTransform = `translateX(${shadowOffsetX * 0.6}px) translateY(${-size * 0.1}px) rotateX(90deg) translateZ(${-hH - size * 0.01}px) scale(1)`

  return (
    <div
      className={`gb-scene ${isOpen ? 'gb-open' : ''} ${className}`}
      data-drag={dragging ? '1' : '0'}
      role="button"
      tabIndex={0}
      aria-pressed={isOpen}
      aria-label={isOpen ? 'Gift box, open' : 'Gift box, closed'}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onKeyDown={onKeyDown}
      style={
        {
          height: size * 1.9,
          perspective: size * 5.5,
          '--gb-dur': '1.05s',
          '--gb-lid-closed': lidClosedTransform,
          '--gb-lid-open': lidOpenTransform,
          '--gb-gift-closed': `translateY(${size * 0.1}px) scale(.55)`,
          '--gb-gift-open': `translateY(${-size * 0.6}px) translateZ(2px) rotate(-6deg) scale(1)`,
          '--gb-shadow-closed': shadowBaseTransform,
          '--gb-shadow-open': shadowOpenTransform,
          '--gb-shadow-blur-closed': `${Math.max(2, size * 0.045)}px`,
          '--gb-shadow-blur-open': `${Math.max(3, size * 0.075)}px`,
          '--gb-shadow-op-closed': 0.85,
          '--gb-shadow-op-open': 0.55,
          '--gb-lidshadow-closed': lidShadowClosedTransform,
          '--gb-lidshadow-open': lidShadowOpenTransform,
          '--gb-lidshadow-blur-closed': `${Math.max(2, size * 0.03)}px`,
          '--gb-lidshadow-blur-open': `${Math.max(2, size * 0.05)}px`,
          '--gb-lidshadow-op-open': 0.4,
          ...style,
        } as CSSProperties
      }
    >
      <div
        style={{
          position: 'relative',
          width: 0,
          height: 0,
          transformStyle: 'preserve-3d',
          transform: `rotateX(${rot.x.toFixed(1)}deg) rotateY(${rot.y.toFixed(1)}deg)`,
        }}
      >
        <div style={{ position: 'absolute', transformStyle: 'preserve-3d' }}>
          <div
            className="gb-shadow"
            style={{
              position: 'absolute',
              left: -shadowW / 2,
              top: -shadowH / 2,
              width: shadowW,
              height: shadowH,
              borderRadius: '50%',
              background: 'rgba(90, 110, 70, 0.20)',
              pointerEvents: 'none',
            }}
          />
          <div
            className="gb-lid-shadow"
            style={{
              position: 'absolute',
              left: -lidShadowW / 2,
              top: -lidShadowH / 2,
              width: lidShadowW,
              height: lidShadowH,
              borderRadius: '50%',
              background: 'rgba(90, 110, 70, 0.22)',
              pointerEvents: 'none',
            }}
          />

          <div style={{ ...slab, background: faceBg(c.outerBottom, 0.06), boxShadow: faceShadow(), transform: `rotateX(90deg) translateZ(${-hH}px)` }}>
            <div style={ribbonBand(c.ribbonFloor, 'v', rw)} />
            <div style={ribbonBand(c.ribbonFloor, 'h', rw)} />
          </div>

          <div style={{ ...wall, background: innerWallBg, boxShadow: faceShadow(true), transform: `translateZ(${-hW + 1}px)` }}>
            <div style={ribbonBand(c.ribbonInnerFrontBack, 'v', rw * 0.85)} />
          </div>
          <div style={{ ...wall, background: innerWallBg, boxShadow: faceShadow(true), transform: `translateZ(${hW - 1}px) rotateY(180deg)` }}>
            <div style={ribbonBand(c.ribbonInnerFrontBack, 'v', rw * 0.85)} />
          </div>
          <div style={{ ...wall, background: innerWallBg, boxShadow: faceShadow(true), transform: `rotateY(90deg) translateZ(${-hW + 1}px)` }}>
            <div style={ribbonBand(c.ribbonInnerSides, 'v', rw * 0.85)} />
          </div>
          <div style={{ ...wall, background: innerWallBg, boxShadow: faceShadow(true), transform: `rotateY(-90deg) translateZ(${-hW + 1}px)` }}>
            <div style={ribbonBand(c.ribbonInnerSides, 'v', rw * 0.85)} />
          </div>
          <div style={{ ...slab, background: faceBg(c.innerFloor, 0.05), boxShadow: faceShadow(true), transform: `rotateX(90deg) translateZ(${-hH + 2}px)` }}>
            <div style={ribbonBand(c.ribbonFloor, 'v', rw)} />
            <div style={ribbonBand(c.ribbonFloor, 'h', rw)} />
          </div>

          <div style={{ ...wall, background: faceBg(c.boxFront, 0.1, true), boxShadow: faceShadow(), transform: `translateZ(${hW}px)` }}>
            <div style={ribbonBand(c.ribbonFront, 'v', rw)} />
          </div>
          <div style={{ ...wall, background: faceBg(c.boxBack, 0.16, true), boxShadow: faceShadow(), transform: `translateZ(${-hW}px) rotateY(180deg)` }}>
            <div style={ribbonBand(c.ribbonBack, 'v', rw)} />
          </div>
          <div style={{ ...wall, background: faceBg(c.boxLeft, 0.2, true), boxShadow: faceShadow(), transform: `rotateY(-90deg) translateZ(${hW}px)` }}>
            <div style={ribbonBand(c.ribbonLeft, 'v', rw)} />
          </div>
          <div style={{ ...wall, background: faceBg(c.boxRight, 0.16, true), boxShadow: faceShadow(), transform: `rotateY(90deg) translateZ(${hW}px)` }}>
            <div style={ribbonBand(c.ribbonRight, 'v', rw)} />
          </div>

          <div
            className="gb-gift"
            style={{
              position: 'absolute',
              left: -giftSize / 2,
              top: -giftSize / 2,
              width: giftSize,
              height: giftSize,
              borderRadius: giftSize * 0.26,
              background: children ? 'transparent' : shade(c.ribbonFace, -0.1),
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {children}
          </div>
        </div>

        <div className="gb-lid" style={{ position: 'absolute', transformStyle: 'preserve-3d' }}>
          <div style={{ ...lidWall, background: faceBg(c.lidFront, 0.08), boxShadow: faceShadow(), transform: `translateZ(${hLW}px)` }}>
            <div style={ribbonBand(c.ribbonFront, 'v', rw)} />
          </div>
          <div style={{ ...lidWall, background: faceBg(c.lidBack, 0.14), boxShadow: faceShadow(), transform: `translateZ(${-hLW}px) rotateY(180deg)` }}>
            <div style={ribbonBand(c.ribbonBack, 'v', rw)} />
          </div>
          <div style={{ ...lidWall, background: faceBg(c.lidLeft, 0.18), boxShadow: faceShadow(), transform: `rotateY(-90deg) translateZ(${hLW}px)` }}>
            <div style={ribbonBand(c.ribbonLeft, 'v', rw)} />
          </div>
          <div style={{ ...lidWall, background: faceBg(c.lidRight, 0.14), boxShadow: faceShadow(), transform: `rotateY(90deg) translateZ(${hLW}px)` }}>
            <div style={ribbonBand(c.ribbonRight, 'v', rw)} />
          </div>
          <div style={{ ...lidSlab, background: faceBg(c.lidTop, 0.05), boxShadow: faceShadow(), transform: `rotateX(90deg) translateZ(${hLH}px)` }}>
            <div style={ribbonBand(c.ribbonFace, 'v', rw)} />
            <div style={ribbonBand(c.ribbonFace, 'h', rw)} />
          </div>
          <div style={{ ...lidSlab, background: faceBg(c.lidUnder, 0.04), boxShadow: faceShadow(true), transform: `rotateX(-90deg) translateZ(${-hLH}px)` }} />
        </div>
      </div>
    </div>
  )
}
