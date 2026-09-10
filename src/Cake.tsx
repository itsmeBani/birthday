import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { extend, useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { useGLTF, ContactShadows, OrbitControls, Html } from '@react-three/drei'
import { RoundedBoxGeometry } from 'three-stdlib'
import * as THREE from 'three'
import photoCatPlush from './assets/photo-cat-plush.png'
import photoPark1 from './assets/photo-park-1.jpg'
import photoPark2 from './assets/photo-park-2.jpg'
import photoSelfie1 from './assets/photo-selfie-1.jpg'
import photoSelfie2 from './assets/photo-selfie-2.jpg'
import photoCafe from './assets/photo-cafe.jpg'

// ContactShadows renders the whole scene from its own top-down camera (default layer 0 only).
// Floating props live on this layer instead, so they're excluded from that render and don't
// smear the shared shadow with their own silhouette; they get their own flat shadow instead.
const PROP_LAYER = 1

function EnablePropLayer() {
  const camera = useThree((s) => s.camera)
  const raycaster = useThree((s) => s.raycaster)
  useEffect(() => {
    camera.layers.enable(PROP_LAYER)
    raycaster.layers.enable(PROP_LAYER)
  }, [camera, raycaster])
  return null
}

function useAssignLayer(layer: number) {
  const ref = useRef<THREE.Group>(null)
  useEffect(() => {
    ref.current?.traverse((o) => o.layers.set(layer))
  }, [layer])
  return ref
}

function makeRadialShadowTexture(size = 256): THREE.Texture {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  // Same dark tone as the cake's ContactShadows plate shadow (#1c2a0c), so floating
  // props read as part of the same lighting/shadow language as the rest of the scene.
  // A long, gentle tail (vs. a hard-edged blob) is what reads as a soft ambient shadow
  // rather than a flat sticker underneath the object.
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  gradient.addColorStop(0, 'rgba(28,42,12,0.55)')
  gradient.addColorStop(0.3, 'rgba(28,42,12,0.4)')
  gradient.addColorStop(0.55, 'rgba(28,42,12,0.22)')
  gradient.addColorStop(0.78, 'rgba(28,42,12,0.08)')
  gradient.addColorStop(1, 'rgba(28,42,12,0)')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, size, size)
  const texture = new THREE.CanvasTexture(canvas)
  texture.minFilter = THREE.LinearFilter
  return texture
}

// Lazy singleton: soft radial falloff, shared by every prop's grounded shadow.
let shadowTextureCache: THREE.Texture | null = null
function getShadowTexture(): THREE.Texture {
  if (!shadowTextureCache) shadowTextureCache = makeRadialShadowTexture()
  return shadowTextureCache
}

// Soft-edged contact shadow for a single prop, anchored at ground level (unlike the prop
// itself, which lifts on hover). It shrinks and fades as the prop rises — like a real
// shadow losing contact with the ground — instead of sitting there as a static dark oval
// once the gap between object and shadow opens up.
function GroundedShadow({
  radiusX,
  radiusZ = radiusX,
  hovered,
}: {
  radiusX: number
  radiusZ?: number
  hovered: boolean
}) {
  const texture = getShadowTexture()
  const mesh = useRef<THREE.Mesh>(null)
  const material = useRef<THREE.MeshBasicMaterial>(null)
  useFrame(() => {
    if (!mesh.current || !material.current) return
    const targetFactor = hovered ? 0.65 : 1
    const factor = THREE.MathUtils.lerp(mesh.current.scale.x / radiusX, targetFactor, 0.15)
    mesh.current.scale.set(radiusX * factor, radiusZ * factor, 1)
    material.current.opacity = THREE.MathUtils.lerp(material.current.opacity, hovered ? 0.45 : 1, 0.15)
  })
  return (
    <mesh ref={mesh} position={[0, 0.004, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={[radiusX, radiusZ, 1]} renderOrder={1}>
      <planeGeometry args={[2, 2]} />
      <meshBasicMaterial ref={material} map={texture} transparent opacity={1} depthWrite={false} />
    </mesh>
  )
}

// Floating "this is clickable" hint that hovers above an unopened prop. Rendered via drei's
// Html (a billboarded DOM overlay pinned to a 3D point) rather than a texture, so the text
// stays crisp at any zoom level. pointerEvents: none keeps it purely decorative — clicks pass
// straight through to the object underneath.
function Callout({ text, position }: { text: string; position: [number, number, number] }) {
  return (
    <Html position={position} center occlude={false} zIndexRange={[3, 0]} style={{ pointerEvents: 'none' }}>
      <div className="scene-callout">{text}</div>
    </Html>
  )
}

extend({ RoundedBoxGeometry })

declare module '@react-three/fiber' {
  interface ThreeElements {
    roundedBoxGeometry: ThreeElements['boxGeometry'] & {
      args?: ConstructorParameters<typeof RoundedBoxGeometry>
    }
  }
}

const CAKE_URL = '/models/matcha-cake/scene.gltf'

const CANDLE_COUNT = 5
const CANDLE_RADIUS = 0.82
const CANDLE_TOP_Y = 1.26
// Strawberries + stems cluster near the front-center of the cake top;
// candles ring the back half so nothing overlaps the fruit.
const CANDLE_ARC_START = Math.PI * 0.62
const CANDLE_ARC_END = Math.PI * 2.38

function CakeModel({ onReady }: { onReady?: () => void }) {
  const { scene } = useGLTF(CAKE_URL)
  const model = useMemo(() => scene.clone(true), [scene])
  useEffect(() => onReady?.(), [onReady])
  return <primitive object={model} />
}

useGLTF.preload(CAKE_URL)

function Flame({ lit }: { lit: boolean }) {
  const group = useRef<THREE.Group>(null)
  const light = useRef<THREE.PointLight>(null)
  const seedRef = useRef(0)
  useEffect(() => {
    seedRef.current = Math.random() * 100
  }, [])

  useFrame((state) => {
    const t = state.clock.elapsedTime * 6 + seedRef.current
    const flicker = 0.85 + Math.sin(t) * 0.1 + Math.sin(t * 2.7) * 0.05
    const target = lit ? flicker : 0
    if (group.current) {
      group.current.scale.setScalar(THREE.MathUtils.lerp(group.current.scale.x, target, 0.15))
    }
    if (light.current) {
      light.current.intensity = THREE.MathUtils.lerp(
        light.current.intensity,
        lit ? 1.1 * flicker : 0,
        0.15,
      )
    }
  })

  return (
    <group ref={group} position={[0, 0.255, 0]}>
      <mesh position={[0, 0.076, 0]}>
        <coneGeometry args={[0.024, 0.153, 8]} />
        <meshStandardMaterial
          color="#ffd27a"
          emissive="#ff9d2e"
          emissiveIntensity={2.2}
          toneMapped={false}
        />
      </mesh>
      <pointLight ref={light} color="#ffb454" distance={1.1} intensity={0} decay={2} />
    </group>
  )
}

function Candle({ angle, lit }: { angle: number; lit: boolean }) {
  const x = Math.cos(angle) * CANDLE_RADIUS
  const z = Math.sin(angle) * CANDLE_RADIUS
  return (
    <group position={[x, CANDLE_TOP_Y, z]}>
      <mesh position={[0, 0.102, 0]} castShadow>
        <cylinderGeometry args={[0.037, 0.037, 0.204, 12]} />
        <meshStandardMaterial color="#faf6ea" roughness={0.4} />
      </mesh>
      <mesh position={[0, 0.17, 0]}>
        <cylinderGeometry args={[0.04, 0.04, 0.027, 12]} />
        <meshStandardMaterial color="#5c7a34" roughness={0.5} />
      </mesh>
      <mesh position={[0, 0.213, 0]}>
        <cylinderGeometry args={[0.005, 0.005, 0.051, 6]} />
        <meshStandardMaterial color="#3a2c1a" />
      </mesh>
      <Flame lit={lit} />
    </group>
  )
}

function CandleRing({ lit }: { lit: boolean }) {
  const angles = useMemo(() => {
    const span = CANDLE_ARC_END - CANDLE_ARC_START
    return Array.from({ length: CANDLE_COUNT }, (_, i) =>
      CANDLE_ARC_START + (span * i) / (CANDLE_COUNT - 1),
    )
  }, [])
  return (
    <>
      {angles.map((a, i) => (
        <Candle key={i} angle={a} lit={lit} />
      ))}
    </>
  )
}

// Gentle idle bob + hover lift, so unopened items read as clickable.
// Offsets are divided by the object's own `scale` prop because this group sits inside
// that scaled parent — otherwise a bigger object (e.g. the envelope) would float much
// higher in world space than a smaller one for the same local offset, breaking contact
// shadow alignment.
function useClickableBob(seed: number, isOpen: boolean, hovered: boolean, scale: number) {
  const ref = useRef<THREE.Group>(null)
  useFrame((state) => {
    if (!ref.current) return
    const idleBob = isOpen ? 0 : (Math.sin(state.clock.elapsedTime * 1.6 + seed) * 0.02) / scale
    const hoverLift = hovered ? 0.14 / scale : 0
    ref.current.position.y = THREE.MathUtils.lerp(ref.current.position.y, idleBob + hoverLift, 0.15)
    const targetScale = hovered ? 1.06 : 1
    ref.current.scale.setScalar(THREE.MathUtils.lerp(ref.current.scale.x, targetScale, 0.15))
  })
  return ref
}

function shade(hex: string, amt: number): string {
  const c = new THREE.Color(hex)
  return amt >= 0 ? c.lerp(new THREE.Color('#ffffff'), amt).getStyle() : c.multiplyScalar(1 + amt).getStyle()
}

function makeNoiseTexture(size: number, repeat: number, lo: number, hi: number): THREE.Texture {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  const imageData = ctx.createImageData(size, size)
  for (let i = 0; i < imageData.data.length; i += 4) {
    const v = lo + Math.random() * (hi - lo)
    imageData.data[i] = v
    imageData.data[i + 1] = v
    imageData.data[i + 2] = v
    imageData.data[i + 3] = 255
  }
  ctx.putImageData(imageData, 0, 0)
  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping
  texture.repeat.set(repeat, repeat)
  return texture
}

// Lazy singleton: paper grain texture, shared across all gift boxes.
let paperTextureCache: THREE.Texture | null = null
function getPaperTexture(): THREE.Texture {
  if (!paperTextureCache) paperTextureCache = makeNoiseTexture(128, 4, 195, 255)
  return paperTextureCache
}

// Printed-card face for a photo card: bordered photo (or placeholder) + greeting text, one
// per accent color so a fanned stack of cards doesn't look like identical clones.
const photoCardTextureCache = new Map<string, THREE.Texture>()
function getPhotoCardTexture(accent: string, photo: HTMLImageElement | null): THREE.Texture {
  const key = `${accent}|${photo?.src ?? 'placeholder'}`
  const cached = photoCardTextureCache.get(key)
  if (cached) return cached

  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 640
  const ctx = canvas.getContext('2d')!

  ctx.fillStyle = '#fbf8ef'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.strokeStyle = accent
  ctx.lineWidth = 10
  ctx.strokeRect(15, 15, canvas.width - 30, canvas.height - 30)

  const px = 48
  const py = 48
  const pw = canvas.width - 96
  const ph = 368

  if (photo) {
    ctx.save()
    ctx.beginPath()
    ctx.rect(px, py, pw, ph)
    ctx.clip()
    // Cover-fit: scale so the shorter axis fills the frame, then center-crop the rest.
    const coverScale = Math.max(pw / photo.width, ph / photo.height)
    const dw = photo.width * coverScale
    const dh = photo.height * coverScale
    ctx.drawImage(photo, px + (pw - dw) / 2, py + (ph - dh) / 2, dw, dh)
    // Lift the shadows slightly so the printed picture stays readable against the scene's
    // dimmed backdrop, especially on mobile displays with lower brightness.
    ctx.fillStyle = 'rgba(255,255,255,0.12)'
    ctx.fillRect(px, py, pw, ph)
    ctx.restore()
  } else {
    const photoGrad = ctx.createLinearGradient(px, py, px, py + ph)
    photoGrad.addColorStop(0, '#eef2df')
    photoGrad.addColorStop(1, '#b9c98d')
    ctx.fillStyle = photoGrad
    ctx.fillRect(px, py, pw, ph)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = 'rgba(50,60,32,0.55)'
    ctx.font = '92px system-ui, sans-serif'
    ctx.fillText('🎂', px + pw / 2, py + ph / 2 - 14)
    ctx.font = '600 22px system-ui, sans-serif'
    ctx.fillText('your photo here', px + pw / 2, py + ph / 2 + 88)
  }
  ctx.strokeStyle = accent
  ctx.lineWidth = 4
  ctx.strokeRect(px, py, pw, ph)

  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = '#3c4a24'
  ctx.font = 'italic 44px Georgia, "Times New Roman", serif'
  ctx.fillText('Happy', canvas.width / 2, py + ph + 68)
  ctx.font = '700 48px system-ui, sans-serif'
  ctx.fillStyle = accent
  ctx.fillText('BIRTHDAY', canvas.width / 2, py + ph + 122)
  ctx.font = '500 25px system-ui, sans-serif'
  ctx.fillStyle = '#3c4a24'
  ctx.fillText('wishes to you!', canvas.width / 2, py + ph + 162)
  ctx.font = '20px system-ui, sans-serif'
  ctx.fillStyle = 'rgba(50,60,32,0.65)'
  ctx.fillText('— Russel', canvas.width / 2, py + ph + 210)

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  photoCardTextureCache.set(key, texture)
  return texture
}

// Loads an <img> outside of React (cached across all cards) and triggers one re-render on the
// calling component once it's ready, so getPhotoCardTexture can bake the real photo in.
const loadedImageCache = new Map<string, HTMLImageElement>()
function useLoadedImage(src?: string): HTMLImageElement | null {
  const [, bump] = useState(0)
  useEffect(() => {
    if (!src || loadedImageCache.has(src)) return
    const img = new Image()
    img.onload = () => {
      loadedImageCache.set(src, img)
      bump((n) => n + 1)
    }
    img.src = src
  }, [src])
  return src ? (loadedImageCache.get(src) ?? null) : null
}

// Flat picture-frame shape spanning the gap between the box's outer wall and
// the inset interior wall, so the open rim reads as cardboard thickness
// instead of a see-through gap to the empty scene background.
let giftBoxRimShapeCache: THREE.Shape | null = null
function getGiftBoxRimShape(): THREE.Shape {
  if (giftBoxRimShapeCache) return giftBoxRimShapeCache
  // The hidden top face group's true edge (per RoundedBoxGeometry's rounding
  // math) reaches ~0.304 at its widest, past the box's nominal 0.31 half-size
  // isn't quite enough margin on its own — pad a bit further to be safe.
  const outer = 0.315
  const inner = 0.28
  const shape = new THREE.Shape()
  shape.moveTo(-outer, -outer)
  shape.lineTo(outer, -outer)
  shape.lineTo(outer, outer)
  shape.lineTo(-outer, outer)
  shape.lineTo(-outer, -outer)
  const hole = new THREE.Path()
  hole.moveTo(-inner, -inner)
  hole.lineTo(-inner, inner)
  hole.lineTo(inner, inner)
  hole.lineTo(inner, -inner)
  hole.lineTo(-inner, -inner)
  shape.holes.push(hole)
  giftBoxRimShapeCache = shape
  return shape
}

function GiftBox({
  position,
  rotationY = 0,
  scale = 1,
  boxColor,
  ribbonColor,
  isOpen = false,
  hint,
  onClick,
}: {
  position: [number, number, number]
  rotationY?: number
  scale?: number
  boxColor: string
  ribbonColor: string
  isOpen?: boolean
  hint?: string
  onClick?: () => void
}) {
  const lidRef = useRef<THREE.Group>(null)
  const [hovered, setHovered] = useState(false)
  // Deterministic per-instance offset (from position) so multiple boxes don't bob in lockstep.
  const seed = position[0] * 3.7 + position[2] * 5.3
  const bobRef = useClickableBob(seed, isOpen, hovered, scale)
  const layerRef = useAssignLayer(PROP_LAYER)

  const palette = useMemo(
    () => ({
      front: boxColor,
      back: shade(boxColor, -0.16),
      side: shade(boxColor, -0.32),
      bottom: shade(boxColor, -0.55),
      lidFront: shade(boxColor, 0.05),
      lidBack: shade(boxColor, -0.1),
      lidSide: shade(boxColor, -0.22),
      lidTop: shade(boxColor, 0.24),
      lidUnder: shade(boxColor, -0.62),
      ribbonBody: ribbonColor,
      innerWall: '#F5F0DF',
      innerFloor: '#E8E1C6',
    }),
    [boxColor, ribbonColor],
  )

  // Material group order for a BoxGeometry: +x, -x, +y, -y, +z, -z
  const bodyFaces: string[] = [palette.side, palette.side, palette.front, palette.bottom, palette.front, palette.back]
  const lidBaseFaces: string[] = [palette.lidSide, palette.lidSide, palette.lidTop, palette.lidUnder, palette.lidFront, palette.lidBack]
  const paperTexture = getPaperTexture()

  useFrame(() => {
    if (!lidRef.current) return
    const targetY = isOpen ? 0.5 : 0
    const targetRotZ = isOpen ? 0.55 : 0
    const targetRotX = isOpen ? -0.35 : 0
    lidRef.current.position.y = THREE.MathUtils.lerp(lidRef.current.position.y, targetY, 0.1)
    lidRef.current.rotation.z = THREE.MathUtils.lerp(lidRef.current.rotation.z, targetRotZ, 0.1)
    lidRef.current.rotation.x = THREE.MathUtils.lerp(lidRef.current.rotation.x, targetRotX, 0.1)
  })

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    onClick?.()
  }

  return (
    <group
      ref={layerRef}
      position={position}
      rotation={[0, rotationY, 0]}
      scale={scale}
      onClick={handleClick}
      onPointerOver={(e) => {
        e.stopPropagation()
        document.body.style.cursor = 'pointer'
        setHovered(true)
      }}
      onPointerOut={() => {
        document.body.style.cursor = 'auto'
        setHovered(false)
      }}
    >
      <GroundedShadow radiusX={0.36} hovered={hovered} />
      <group ref={bobRef}>
      {hint && !isOpen && <Callout text={hint} position={[0, 0.95, 0]} />}
      <mesh position={[0, 0.275, 0]} castShadow receiveShadow>
        <roundedBoxGeometry args={[0.62, 0.55, 0.62, 2, 0.02]} />
        {bodyFaces.map((color, i) =>
          // +y (top, index 2) is left open so the hollow interior shows once the lid lifts off.
          i === 2 ? (
            <meshStandardMaterial key={i} attach={`material-${i}`} transparent opacity={0} depthWrite={false} />
          ) : (
            <meshStandardMaterial
              key={i}
              attach={`material-${i}`}
              color={color}
              roughness={0.62}
              roughnessMap={paperTexture}
              bumpMap={paperTexture}
              bumpScale={0.008}
            />
          ),
        )}
      </mesh>
      {/* Ribbon trim hugs the wall thickness only, so it doesn't slab through the hollow interior. */}
      <mesh position={[0, 0.276, 0.305]} castShadow>
        <boxGeometry args={[0.15, 0.552, 0.04]} />
        <meshStandardMaterial color={palette.ribbonBody} roughness={0.32} metalness={0.05} />
      </mesh>
      <mesh position={[0, 0.276, -0.305]} castShadow>
        <boxGeometry args={[0.15, 0.552, 0.04]} />
        <meshStandardMaterial color={palette.ribbonBody} roughness={0.32} metalness={0.05} />
      </mesh>
      <mesh position={[0.305, 0.276, 0]} castShadow>
        <boxGeometry args={[0.04, 0.552, 0.15]} />
        <meshStandardMaterial color={palette.ribbonBody} roughness={0.32} metalness={0.05} />
      </mesh>
      <mesh position={[-0.305, 0.276, 0]} castShadow>
        <boxGeometry args={[0.04, 0.552, 0.15]} />
        <meshStandardMaterial color={palette.ribbonBody} roughness={0.32} metalness={0.05} />
      </mesh>
      {/* Hollow interior so the box isn't a flat empty patch once the lid lifts off. */}
      <mesh position={[0, 0.55, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <shapeGeometry args={[getGiftBoxRimShape()]} />
        <meshStandardMaterial color={palette.innerWall} roughness={0.75} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, 0.07, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.56, 0.56]} />
        <meshStandardMaterial color={palette.innerFloor} roughness={0.8} />
      </mesh>
      <mesh position={[0, 0.31, -0.28]}>
        <planeGeometry args={[0.56, 0.48]} />
        <meshStandardMaterial color={palette.innerWall} roughness={0.8} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, 0.31, 0.28]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[0.56, 0.48]} />
        <meshStandardMaterial color={palette.innerWall} roughness={0.8} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[-0.28, 0.31, 0]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[0.56, 0.48]} />
        <meshStandardMaterial color={palette.innerWall} roughness={0.8} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0.28, 0.31, 0]} rotation={[0, -Math.PI / 2, 0]}>
        <planeGeometry args={[0.56, 0.48]} />
        <meshStandardMaterial color={palette.innerWall} roughness={0.8} side={THREE.DoubleSide} />
      </mesh>

      <group ref={lidRef}>
        <mesh position={[0, 0.615, 0]}  castShadow receiveShadow>
          <roundedBoxGeometry args={[0.7, 0.13, 0.7, 2, 0.025]} />
          {lidBaseFaces.map((color, i) => (
            <meshStandardMaterial
              key={i}
              attach={`material-${i}`}
              color={color}
              roughness={0.55}
              roughnessMap={paperTexture}
              bumpMap={paperTexture}
              bumpScale={0.006}
            />
          ))}
        </mesh>
      </group>

      </group>
    </group>
  )
}

function Envelope({
  position,
  rotationY = 0,
  scale = 1,
  paperColor,
  sealColor,
  isOpen = false,
  hint,

  onClick,
}: {
  position: [number, number, number]
  rotationY?: number
  scale?: number
  paperColor: string
  sealColor: string
  isOpen?: boolean
  hint?: string
  onClick?: () => void
}) {
  const t = 0.035
  const flapRef = useRef<THREE.Group>(null)
  const letterRef = useRef<THREE.Group>(null)
  const [hovered, setHovered] = useState(false)
  const seed = position[0] * 3.7 + position[2] * 5.3
  const bobRef = useClickableBob(seed, isOpen, hovered, scale)
  const layerRef = useAssignLayer(PROP_LAYER)
  const creaseColor = useMemo(
    () => new THREE.Color(paperColor).multiplyScalar(0.55).getStyle(),
    [paperColor],
  )

  const flapGeometry = useMemo(() => {
    const shape = new THREE.Shape()
    shape.moveTo(-0.45, 0)
    shape.lineTo(0.45, 0)
    shape.lineTo(0, -0.42)
    shape.closePath()
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.02, bevelEnabled: false })
    geo.rotateX(-Math.PI / 2)
    return geo
  }, [])

  useFrame(() => {
    if (flapRef.current) {
      const target = isOpen ? -2.35 : 0
      flapRef.current.rotation.x = THREE.MathUtils.lerp(flapRef.current.rotation.x, target, 0.1)
    }
    if (letterRef.current) {
      const targetY = isOpen ? 0.34 : t + 0.005
      letterRef.current.position.y = THREE.MathUtils.lerp(letterRef.current.position.y, targetY, 0.1)
    }
  })

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    onClick?.()
  }

  return (
    <group
      ref={layerRef}
      position={position}
      rotation={[0, rotationY, 0]}
      scale={scale}
      onClick={handleClick}
      onPointerOver={(e) => {
        e.stopPropagation()
        document.body.style.cursor = 'pointer'
        setHovered(true)
      }}
      onPointerOut={() => {
        document.body.style.cursor = 'auto'
        setHovered(false)
      }}
    >
      <GroundedShadow radiusX={0.44} radiusZ={0.34} hovered={hovered} />
      <group ref={bobRef}>
      {hint && !isOpen && <Callout text={hint} position={[0, 0.55, 0]} />}
      <mesh position={[0, t / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.9, t, 0.62]} />
        <meshStandardMaterial color={paperColor} roughness={0.75} />
      </mesh>
      <mesh position={[0, 0.001, 0]}>
        <boxGeometry args={[0.91, 0.006, 0.63]} />
        <meshStandardMaterial color={creaseColor} roughness={0.8} />
      </mesh>

      <group ref={letterRef} position={[0, t + 0.005, 0.02]}>
        <mesh castShadow>
          <boxGeometry args={[0.74, 0.014, 0.5]} />
          <meshStandardMaterial color="#fffdf6" roughness={0.6} />
        </mesh>
      </group>

      <group ref={flapRef} position={[0, t + 0.002, -0.31]}>
        <mesh geometry={flapGeometry} castShadow>
          <meshStandardMaterial color={paperColor} roughness={0.7} side={THREE.DoubleSide} />
        </mesh>
        <mesh position={[-0.225, 0.032, 0.21]} rotation={[0, -0.75, 0]}>
          <boxGeometry args={[0.64, 0.01, 0.022]} />
          <meshStandardMaterial color={creaseColor} roughness={0.8} />
        </mesh>
        <mesh position={[0.225, 0.032, 0.21]} rotation={[0, 0.75, 0]}>
          <boxGeometry args={[0.64, 0.01, 0.022]} />
          <meshStandardMaterial color={creaseColor} roughness={0.8} />
        </mesh>
        <mesh position={[0, 0.026, 0.355]} scale={[1, 0.62, 0.86]} castShadow>
          <sphereGeometry args={[0.075, 16, 12]} />
          <meshStandardMaterial color={sealColor} roughness={0.42} />
        </mesh>
        <mesh position={[-0.014, 0.052, 0.34]}>
          <sphereGeometry args={[0.012, 8, 8]} />
          <meshStandardMaterial
            color={sealColor}
            emissive={sealColor}
            emissiveIntensity={0.3}
            roughness={0.2}
          />
        </mesh>
      </group>
      </group>
    </group>
  )
}

// Distance in front of the *live* camera (not a fixed world point) that an opened card/the
// backdrop sits at. This has to be a *fraction of the camera's current distance to the
// OrbitControls target* rather than a fixed number of units — otherwise, if the user has
// zoomed in close before opening a card, other scene props (which cluster near the target)
// can end up closer to the camera than a fixed-distance backdrop, rendering in front of it
// and staying undimmed instead of behind it.
const PHOTO_ORBIT_TARGET = new THREE.Vector3(0, 0.5, 0)
const PHOTO_FEATURED_DISTANCE_FACTOR = 0.4
const PHOTO_BACKDROP_DISTANCE_FACTOR = 0.55
const PHOTO_CARD_GROUP_Y = -0.65
// A fixed scale multiplier only looks right at the zoom level it was tuned for — since
// featuredDistance is itself proportional to the camera's current zoom, the frustum's actual
// height at that depth shrinks right along with it when the user has zoomed in, so a fixed
// scale can outgrow the visible frame and get clipped top/bottom. Instead the open card is
// sized as a fraction of whatever's actually visible at its distance, every frame.
const PHOTO_CARD_BASE_HEIGHT = 0.62
const PHOTO_FEATURED_FILL_FRACTION = 0.62

// Reused scratch objects (billboarding runs every frame for every open card/backdrop; these
// avoid allocating a new Vector3/Quaternion each time).
const _camForward = new THREE.Vector3()
const _billboardQuat = new THREE.Quaternion()
// The card's printed face is built lying flat (local normal +Y). Rotating that by +90° about
// X first turns it into local +Z, which lines up with how a camera's own quaternion is applied
// below — so afterwards the face ends up pointing straight back at the camera.
const _faceUpToForward = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2)

function  PhotoCard({
  position,
  rotationY = 0,
  scale = 1,
  sceneScale = 1,
  accent,
  photoSrc,
  open,
  hint,
  onClick,
}: {
  position: [number, number, number]
  rotationY?: number
  scale?: number
  sceneScale?: number
  accent: string
  photoSrc?: string
  open: boolean
  hint?: string
  onClick?: () => void
}) {
  const layerRef = useAssignLayer(PROP_LAYER)
  const animRef = useRef<THREE.Group>(null)
  const photoImg = useLoadedImage(photoSrc)
  const photoTexture = useMemo(() => getPhotoCardTexture(accent, photoImg), [accent, photoImg])
  const { camera, size } = useThree()
  const closedQuat = useMemo(() => new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rotationY, 0)), [rotationY])

  // The outer group stays put at the card's resting spot on the table (so its shadow never
  // moves and position/scale never fight React's props). This inner group is what lifts,
  // turns to face the *current* camera (however the user has orbited it, same as a 2D modal
  // always centers on screen regardless of scroll position), and grows when open.
  useFrame(() => {
    const g = animRef.current
    if (!g) return
    if (open) {
      camera.getWorldDirection(_camForward)
      const featuredDistance = camera.position.distanceTo(PHOTO_ORBIT_TARGET) * PHOTO_FEATURED_DISTANCE_FACTOR
      const sceneParentY = PHOTO_CARD_GROUP_Y
      // This inner group's position is local to the outer group, which is itself scaled by
      // `scale` — so a desired *world*-space offset has to be divided by that scale first,
      // or it lands `scale`x farther from the target than intended.
      g.position.x = THREE.MathUtils.lerp(
        g.position.x,
        ((camera.position.x + _camForward.x * featuredDistance) / sceneScale - position[0]) / scale,
        0.2,
      )
      g.position.y = THREE.MathUtils.lerp(
        g.position.y,
        ((camera.position.y + _camForward.y * featuredDistance - sceneParentY) / sceneScale - position[1]) / scale,
        0.2,
      )
      g.position.z = THREE.MathUtils.lerp(
        g.position.z,
        ((camera.position.z + _camForward.z * featuredDistance) / sceneScale - position[2]) / scale,
        0.2,
      )
      // Snapped, not slerped: it should always exactly match the live camera with zero lag
      // (same as how the position keeps re-targeting the camera above), rather than visibly
      // trailing behind for a moment if the user orbits while a card is open.
      _billboardQuat.copy(camera.quaternion).multiply(_faceUpToForward)
      g.quaternion.copy(_billboardQuat)
      const fovRad = THREE.MathUtils.degToRad((camera as THREE.PerspectiveCamera).fov)
      const frustumHeightAtCard = 2 * featuredDistance * Math.tan(fovRad / 2)
      // Portrait phones and short browser windows do not have enough vertical room for the
      // desktop-sized featured card. Cap its screen fill there so it stays centered instead
      // of extending under the headline or beyond the viewport.
      const photoFill = size.height < 560 ? 0.42 : PHOTO_FEATURED_FILL_FRACTION
      const targetScale = (frustumHeightAtCard * photoFill) / (PHOTO_CARD_BASE_HEIGHT * scale * sceneScale)
      g.scale.setScalar(THREE.MathUtils.lerp(g.scale.x, targetScale, 0.2))
    } else {
      g.position.x = THREE.MathUtils.lerp(g.position.x, 0, 0.12)
      g.position.y = THREE.MathUtils.lerp(g.position.y, 0, 0.12)
      g.position.z = THREE.MathUtils.lerp(g.position.z, 0, 0.12)
      g.quaternion.slerp(closedQuat, 0.12)
      g.scale.setScalar(THREE.MathUtils.lerp(g.scale.x, 1, 0.12))
    }
  })

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    onClick?.()
  }

  return (
    <group
      ref={layerRef}
      position={position}
      scale={scale}
      onClick={handleClick}
      onPointerOver={(e) => {
        e.stopPropagation()
        document.body.style.cursor = 'pointer'
      }}
      onPointerOut={() => {
        document.body.style.cursor = 'auto'
      }}
    >
      {hint && !open && <Callout text={hint} position={[0, 0.5, 0]} />}
      <group ref={animRef}>
        {/* renderOrder alone (no depthTest override — see below) nudges draw order among
            opaque objects so the featured card wins ties, without breaking normal depth
            comparisons. */}
        <mesh position={[0, 0.01, 0]} renderOrder={open ? 1000 : 0}>
          <boxGeometry args={[0.5, 0.02, 0.62]} />
          {/* Unlit for the same reason as the photo plane below: lit materials pick up a
              directional light's specular highlight, which is subtle at resting size but
              becomes a big distracting white blob once this card is billboarded to face the
              camera and scaled up several times over. */}
          <meshBasicMaterial color="#fbf8ef" />
        </mesh>
        <mesh position={[0, 0.021, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={open ? 1001 : 0}>
          <planeGeometry args={[0.5, 0.62]} />
          {/* Unlit: a lit material goes dark once the card tilts up to face the camera and
              turns away from the scene's directional lights — the print should always read
              at a consistent brightness regardless of orientation. Slightly muted (not pure
              white) so it doesn't look blown-out next to the rest of the lit scene.
              depthTest deliberately left enabled: disabling it also silently disables writing
              to the depth buffer (they're the same GL pipeline stage), which is what let
              ContactShadows' shadow plane — rendered afterward in the transparent pass — test
              against nothing there and draw right over this card. */}
          <meshBasicMaterial map={photoTexture} color="#ffffff" />
        </mesh>
      </group>
    </group>
  )
}

// Dark scrim that always faces the live camera and floats between the featured card and the
// rest of the scene, so an open card reads like it's sitting in front of a modal backdrop.
function PhotoBackdrop({ open, onClick }: { open: boolean; onClick?: () => void }) {
  const layerRef = useAssignLayer(PROP_LAYER)
  const matRef = useRef<THREE.MeshBasicMaterial>(null)
  const { camera } = useThree()

  useFrame(() => {
    const g = layerRef.current
    const m = matRef.current
    if (!g || !m) return
    camera.getWorldDirection(_camForward)
    const backdropDistance = camera.position.distanceTo(PHOTO_ORBIT_TARGET) * PHOTO_BACKDROP_DISTANCE_FACTOR
    g.position.set(
      camera.position.x + _camForward.x * backdropDistance,
      camera.position.y + _camForward.y * backdropDistance,
      camera.position.z + _camForward.z * backdropDistance,
    )
    // Snapped, not slerped: position above is already instant, so the rotation has to match
    // exactly every frame too or the plane and its "always facing camera" position drift out
    // of sync for a moment, which reads as the scrim only covering part of the screen.
    g.quaternion.copy(camera.quaternion)
    // Matches .modal-backdrop's rgba(20,26,12,0.4) tint so the two "put everything else on
    // hold" treatments read as the same design language.
    m.opacity = THREE.MathUtils.lerp(m.opacity, open ? 0.24 : 0, 0.15)
  })

  return (
    <group ref={layerRef}>
      {/* Click-through when closed (raycast disabled) so it never blocks the props behind it;
          only participates in hit-testing — and closes on click, like a modal backdrop — while open. */}
      <mesh
        {...(open ? {} : { raycast: () => null })}
        onClick={(e) => {
          e.stopPropagation()
          onClick?.()
        }}
      >
        <planeGeometry args={[40, 24]} />
        <meshBasicMaterial ref={matRef} color="#141a0c" transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  )
}

function Turntable({ children }: { children: ReactNode }) {
  const group = useRef<THREE.Group>(null)
  useFrame((_, delta) => {
    if (group.current) group.current.rotation.y += delta * 0.12
  })
  return <group ref={group}>{children}</group>
}

// A fanned spread of photo cards, laid flat on one plane (no stacking offsets between them).
const PHOTO_CARDS: {
  id: string
  localPos: [number, number, number]
  rotationY: number
  accent: string
  photoSrc: string
}[] = [
  // One row spanning both open areas: the first 3 sit in the gap left of the cake (where
  // they used to be), the last 3 stay in the gap between the cake and the first gift box.
  // Modest per-card rotation keeps each footprint close to its actual size — large angles
  // balloon it enough that even generous spacing starts crossing into the neighbor.
  { id: 'card1', localPos: [-2.45, 0, 2], rotationY: -0.25, accent: '#7C8F6A', photoSrc: photoCatPlush },
  { id: 'card2', localPos: [-1.5, 0, 2], rotationY: 0.15, accent: '#8CA0A1', photoSrc: photoPark1 },
  { id: 'card3', localPos: [-0.55, 0, 2], rotationY: -0.2, accent: '#8F9074', photoSrc: photoPark2 },
  { id: 'card4', localPos: [0.4, 0, 2], rotationY: 0.2, accent: '#B4AE71', photoSrc: photoSelfie1 },
  { id: 'card5', localPos: [1.35, 0, 2], rotationY: -0.15, accent: '#647a52', photoSrc: photoSelfie2 },
  { id: 'card6', localPos: [2.3, 0, 2], rotationY: 0.25, accent: '#9CAE7A', photoSrc: photoCafe },
]

export default function CakeScene({
  candlesLit,
  envelopeOpen = false,
  gift1Open = false,
  gift2Open = false,
  openPhotoId = null,
  onEnvelopeClick,
  onGiftClick,
  onPhotoClick,
  onPhotoClose,
  onModelReady,
}: {
  candlesLit: boolean
  envelopeOpen?: boolean
  gift1Open?: boolean
  gift2Open?: boolean
  openPhotoId?: string | null
  onEnvelopeClick?: () => void
  onGiftClick?: (id: 'gift1' | 'gift2') => void
  onPhotoClick?: (id: string) => void
  onPhotoClose?: () => void
  onModelReady?: () => void
}) {
  // The props span more than five world units from envelope to gift. On a portrait phone the
  // visible world width is much smaller than on desktop, so scale the *whole* arrangement
  // together to keep every interactive object reachable and preserve their spacing.
  const viewportWidth = useThree((state) => state.viewport.width)
  const sceneScale = THREE.MathUtils.clamp(viewportWidth / 6.35, 0.58, 1)

  return (
    <>
      <EnablePropLayer />
      <color attach="background" args={['#00000000']} />
      <ambientLight intensity={0.55} color="#eef2df" />
      <directionalLight
          castShadow
        position={[3, 5, 2]}
        intensity={1.3}
        color="#fff3d6"
      />
      <directionalLight position={[-4, 2, -3]} intensity={0.35} color="#bcd8a0" />

      <group position={[0, -0.65, 0]} scale={sceneScale}>
        <Turntable>
          <CakeModel onReady={onModelReady} />
          <CandleRing lit={candlesLit} />
        </Turntable>
        <GiftBox
          position={[2.15, 0, 0.25]}
          rotationY={-0.35}
          scale={1.45}
          boxColor="#8CA0A1"
          ribbonColor="#D6D093"
          isOpen={gift1Open}
          hint="Open this"
          onClick={() => onGiftClick?.('gift1')}
        />
        <GiftBox
          position={[2.70, 0, 1.20]}
          rotationY={0.5}
          scale={1.1}
          boxColor="#8F9074"
          ribbonColor="#EDEAD9"
          isOpen={gift2Open}
          hint="Open this"
          onClick={() => onGiftClick?.('gift2')}
        />
        <Envelope
          position={[-2.5, 0, 0.6]}
          rotationY={0.5}
          scale={1.6}
          paperColor="#faf3e2"
          sealColor="#c4483f"
          isOpen={envelopeOpen}
          hint="Read this"
          onClick={onEnvelopeClick}
        />
        {PHOTO_CARDS.map((card) => (
          <PhotoCard
            key={card.id}
            position={card.localPos}
            rotationY={card.rotationY}
            scale={1.3}
            sceneScale={sceneScale}
            accent={card.accent}
            photoSrc={card.photoSrc}
            open={openPhotoId === card.id}
            hint={card.id === 'card1' ? 'Click this' : undefined}
            onClick={() => onPhotoClick?.(card.id)}
          />
        ))}
        <ContactShadows
          position={[0, -0.01, 0]}
          opacity={0.7}
          scale={7.5}
          blur={1.7}
          far={2}
          resolution={1024}
          color="#1c2a0c"
        />
      </group>

      <PhotoBackdrop open={openPhotoId !== null} onClick={onPhotoClose} />

      <OrbitControls
        enablePan={false}
        enableZoom={false}
        zoomToCursor
        minDistance={2.6}
        maxDistance={7.5}
        minPolarAngle={Math.PI * 0.22}
        maxPolarAngle={Math.PI * 0.52}
        autoRotate={false}
        target={[0, 0.5, 0]}
      />
    </>
  )
}
