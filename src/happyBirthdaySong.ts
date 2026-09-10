const NOTE_FREQUENCIES: Record<string, number> = {
  C4: 261.63,
  D4: 293.66,
  E4: 329.63,
  F4: 349.23,
  G4: 392.0,
  A4: 440.0,
  B4: 493.88,
  C5: 523.25,
  D5: 587.33,
  E5: 659.25,
  F5: 698.46,
  G5: 783.99,
}

// "Happy Birthday to You" melody — public domain. Duration in beats.
const MELODY: [note: string, beats: number][] = [
  ['G4', 0.75], ['G4', 0.25], ['A4', 1], ['G4', 1], ['C5', 1], ['B4', 2],
  ['G4', 0.75], ['G4', 0.25], ['A4', 1], ['G4', 1], ['D5', 1], ['C5', 2],
  ['G4', 0.75], ['G4', 0.25], ['G5', 1], ['E5', 1], ['C5', 1], ['B4', 1], ['A4', 2],
  ['F5', 0.75], ['F5', 0.25], ['E5', 1], ['C5', 1], ['D5', 1], ['C5', 2],
]

const BEAT_SECONDS = 0.42

export interface SongPlayback {
  stop: () => void
}

export function playHappyBirthday(onEnd?: () => void): SongPlayback {
  const ctx = new AudioContext()
  const master = ctx.createGain()
  master.gain.value = 0.2
  master.connect(ctx.destination)

  let t = ctx.currentTime + 0.05
  for (const [note, beats] of MELODY) {
    const freq = NOTE_FREQUENCIES[note]
    const dur = beats * BEAT_SECONDS
    const osc = ctx.createOscillator()
    osc.type = 'triangle'
    osc.frequency.value = freq

    const noteGain = ctx.createGain()
    noteGain.gain.setValueAtTime(0, t)
    noteGain.gain.linearRampToValueAtTime(1, t + 0.02)
    noteGain.gain.setValueAtTime(1, t + dur * 0.7)
    noteGain.gain.linearRampToValueAtTime(0, t + dur * 0.98)

    osc.connect(noteGain)
    noteGain.connect(master)
    osc.start(t)
    osc.stop(t + dur * 0.98)

    t += dur
  }

  const totalMs = (t - ctx.currentTime) * 1000
  const endTimeout = window.setTimeout(() => {
    void ctx.close()
    onEnd?.()
  }, totalMs + 150)

  return {
    stop: () => {
      window.clearTimeout(endTimeout)
      const now = ctx.currentTime
      master.gain.cancelScheduledValues(now)
      master.gain.setValueAtTime(master.gain.value, now)
      master.gain.linearRampToValueAtTime(0, now + 0.05)
      window.setTimeout(() => void ctx.close(), 80)
    },
  }
}