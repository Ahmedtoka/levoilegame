// In-app bench: `?bench=<spot>&q=<low|medium|high>` (scripts/bench.mjs drives it).
//
// Flow (main.ts): the quality tier is forced before the engine exists, the intro and the
// avatar editor are skipped (phase → playing straight after boot), the HUD is hidden with
// the `bench` class on <body>, the player is teleported to the spot's pose (yaw AND pitch),
// then we wait until product-photo loading is idle and at least SETTLE_MS have passed, and
// sample SAMPLE_FRAMES frames. The result lands on `window.__bench` and in the document
// title (`BENCH {json}`), which the script polls.
//
// Texture memory is an ESTIMATE: three.js doesn't expose GPU allocations, so we sum
// w × h × 4 × 1.33 (RGBA + mipmaps) over every texture reachable from the scene's
// materials, each texture once. `textureMB` counts only textures the renderer has
// uploaded (renderer.properties has a __version for them: the warmer's definition), which
// is the GPU-resident figure the budget is about; `textureMBScene` counts every reachable
// one, uploaded or not (hidden/culled shop interiors included: the warmer uploads them
// over time, so the resident figure grows towards it). Compressed textures sum their mip
// data; render targets (mirrors, bloom, the PMREM environment) are not counted. `texHist`
// buckets the uploaded textures by their longer side so an agent can see what it added.

import type { Material, Object3D, Texture } from 'three'
import type { Game } from '../game'
import { imageLoads, imagePacer } from '../engine/pace'
import type { QualityLevel } from '../engine/quality'
import { QUALITY_ORDER } from '../engine/quality'
import { store } from '../state/store'
import { benchSpots } from './spots'

export interface BenchParams {
  spot: string
  q: QualityLevel | null
}

export interface BenchResult {
  spot: string
  quality: QualityLevel
  zone: string
  /** Mean CPU time of tick + render submit per frame (ms). */
  msFrame: number
  msMedian: number
  msP95: number
  /** Mean rAF-to-rAF interval (ms) and the fps it implies (vsync-capped at ~16.7 / 60). */
  msInterval: number
  fps: number
  /** Draw calls per frame (mean / max), bloom passes included. */
  calls: number
  callsMax: number
  triangles: number
  /** Textures the renderer has uploaded (renderer.info.memory.textures). */
  textures: number
  /** Estimated bytes of the uploaded (GPU-resident) textures, in MB (see the header). */
  textureMB: number
  /** Same estimate over every texture reachable from the scene, uploaded or not. */
  textureMBScene: number
  /** Uploaded textures by longer side, e.g. "2048:12 1024:80 512:100 <512:69". */
  texHist: string
  frames: number
  /** Seconds from boot start to the first sampled frame. */
  bootS: number
  settleS: number
  /** Whether image loading was idle when sampling started (false = timed out waiting). */
  settled: boolean
  gpu: string
  viewport: [number, number]
  dpr: number
  resolutionScale: number
  pos: [number, number]
  error?: string
}

const SETTLE_MS = 4000
/** Shops within 34 m load their photos (2 at a time): from the plaza that can take a while. */
const SETTLE_TIMEOUT_MS = 90000
const IDLE_STABLE_MS = 1000
const SAMPLE_FRAMES = 150

declare global {
  interface Window {
    __bench?: BenchResult
    __benchPhase?: 'boot' | 'settling' | 'sampling' | 'done'
  }
}

/** `?bench=<spot>[&q=<tier>]`, or null when not benchmarking. */
export function benchParams(): BenchParams | null {
  const p = new URLSearchParams(location.search)
  const spot = p.get('bench')
  if (!spot) return null
  const q = p.get('q')
  return { spot, q: QUALITY_ORDER.includes(q as QualityLevel) ? (q as QualityLevel) : null }
}

/**
 * `?bench` needs `nodemo` (no crowd simulation, decided at module load) and `nolock` (no
 * pointer lock in automation). Reloads once with both; returns true when a reload is pending.
 */
export function benchRedirect(): boolean {
  const p = new URLSearchParams(location.search)
  if (!p.has('bench') || (p.has('nodemo') && p.has('nolock'))) return false
  p.set('nodemo', '')
  p.set('nolock', '')
  location.replace(`${location.pathname}?${p.toString()}${location.hash}`)
  return true
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

export async function runBench(game: Game, params: BenchParams): Promise<BenchResult> {
  const bootS = performance.now() / 1000
  document.body.classList.add('bench')
  window.__benchPhase = 'boot'
  const spots = benchSpots(game.layout)
  const spot = spots[params.spot]
  const quality = game.engine.quality.level
  const base = {
    spot: params.spot,
    quality,
    gpu: gpuString(game),
    viewport: [innerWidth, innerHeight] as [number, number],
    dpr: devicePixelRatio,
    resolutionScale: game.engine.resolutionScale,
    bootS: round(bootS, 1),
  }
  if (!spot) return publish({ ...base, ...empty(), zone: '', error: `unknown spot "${params.spot}" (known: ${Object.keys(spots).join(', ')})` })

  // Skip the intro and the avatar editor; first person, no minimap, no overlay.
  store.getState().set({ phase: 'playing', overlay: null, view: 'first', minimap: false })
  game.player.view = 'first'
  game.player.teleport(spot.x, spot.z, spot.yaw)
  game.player.pitch = spot.pitch

  // Settle: at least SETTLE_MS, and image loading idle for IDLE_STABLE_MS (or the timeout).
  window.__benchPhase = 'settling'
  const t0 = performance.now()
  let idleSince = -1
  let settled = false
  for (;;) {
    const now = performance.now()
    const idle = imageLoads.idle && imagePacer.waiting === 0
    if (!idle) idleSince = -1
    else if (idleSince < 0) idleSince = now
    if (now - t0 >= SETTLE_MS && idle && now - idleSince >= IDLE_STABLE_MS) {
      settled = true
      break
    }
    if (now - t0 >= SETTLE_TIMEOUT_MS) break
    await wait(100)
  }
  const settleS = (performance.now() - t0) / 1000

  // Sample.
  window.__benchPhase = 'sampling'
  const cpu: number[] = []
  const intervals: number[] = []
  const calls: number[] = []
  let tris = 0
  let lastTs = -1
  await new Promise<void>((resolve) => {
    game.frameHook = (ms, ts) => {
      cpu.push(ms)
      if (lastTs >= 0) intervals.push(ts - lastTs)
      lastTs = ts
      calls.push(game.engine.frameCalls().total)
      tris = game.engine.renderer.info.render.triangles
      if (cpu.length >= SAMPLE_FRAMES) {
        game.frameHook = null
        resolve()
      }
    }
  })
  const sorted = [...cpu].sort((a, b) => a - b)
  const msInterval = mean(intervals)
  const result: BenchResult = {
    ...base,
    zone: game.zoneAt(game.player.pos.x, game.player.pos.z),
    msFrame: round(mean(cpu), 2),
    msMedian: round(sorted[Math.floor(sorted.length / 2)] ?? 0, 2),
    msP95: round(sorted[Math.floor(sorted.length * 0.95)] ?? 0, 2),
    msInterval: round(msInterval, 2),
    fps: round(msInterval > 0 ? 1000 / msInterval : 0, 1),
    calls: Math.round(mean(calls)),
    callsMax: Math.max(0, ...calls),
    triangles: tris,
    textures: game.engine.renderer.info.memory.textures,
    ...textureStats(game),
    frames: cpu.length,
    settleS: round(settleS, 1),
    settled,
    resolutionScale: game.engine.resolutionScale,
    pos: [round(game.player.pos.x, 2), round(game.player.pos.z, 2)],
  }
  return publish(result)
}

/** Boot failed (main.ts catch): publish the error so the script fails fast instead of timing out. */
export function benchFail(params: BenchParams, err: unknown): void {
  publish({
    spot: params.spot,
    quality: params.q ?? store.getState().activeQuality,
    zone: '',
    ...empty(),
    bootS: round(performance.now() / 1000, 1),
    gpu: '',
    viewport: [innerWidth, innerHeight],
    dpr: devicePixelRatio,
    resolutionScale: 1,
    error: `boot failed: ${err instanceof Error ? err.message : String(err)}`,
  })
}

function publish(r: BenchResult): BenchResult {
  window.__bench = r
  window.__benchPhase = 'done'
  document.title = 'BENCH ' + JSON.stringify(r)
  console.info('[bench]', r)
  return r
}

function empty() {
  return {
    msFrame: 0,
    msMedian: 0,
    msP95: 0,
    msInterval: 0,
    fps: 0,
    calls: 0,
    callsMax: 0,
    triangles: 0,
    textures: 0,
    textureMB: 0,
    textureMBScene: 0,
    texHist: '',
    frames: 0,
    settleS: 0,
    settled: false,
    pos: [0, 0] as [number, number],
  }
}

const mean = (a: number[]) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0)
const round = (v: number, d: number) => Math.round(v * 10 ** d) / 10 ** d

function gpuString(game: Game): string {
  try {
    const gl = game.engine.renderer.getContext()
    const ext = gl.getExtension('WEBGL_debug_renderer_info')
    return ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : ''
  } catch {
    return ''
  }
}

const SLOTS = ['map', 'alphaMap', 'emissiveMap', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'lightMap', 'bumpMap', 'envMap'] as const

export interface TextureEstimate {
  /** Bytes over every reachable texture. */
  scene: number
  /** Bytes over the reachable textures `isUploaded` accepts. */
  uploaded: number
  /** Uploaded textures by longer side (power-of-two buckets >= 512, the rest under "<512"). */
  hist: Record<string, number>
}

/** See the header: w × h × 4 × 1.33 per distinct texture reachable from the scene's materials. */
export function estimateTextureBytes(scene: Object3D, isUploaded: (t: Texture) => boolean = () => true): TextureEstimate {
  const seen = new Set<string>()
  const est: TextureEstimate = { scene: 0, uploaded: 0, hist: {} }
  const add = (t: Texture | null | undefined) => {
    if (!t || seen.has(t.uuid)) return
    if ((t as Texture & { isRenderTargetTexture?: boolean }).isRenderTargetTexture) return
    seen.add(t.uuid)
    const { bytes, side } = textureSize(t)
    if (!bytes) return
    est.scene += bytes
    if (!isUploaded(t)) return
    est.uploaded += bytes
    const bucket = side >= 512 ? String(2 ** Math.round(Math.log2(side))) : '<512'
    est.hist[bucket] = (est.hist[bucket] ?? 0) + 1
  }
  scene.traverse((o: Object3D) => {
    const mat = (o as Object3D & { material?: Material | Material[] }).material
    if (!mat) return
    for (const m of Array.isArray(mat) ? mat : [mat]) {
      const rec = m as unknown as Record<string, Texture | null | undefined>
      for (const k of SLOTS) add(rec[k])
    }
  })
  return est
}

function textureSize(t: Texture): { bytes: number; side: number } {
  const ct = t as Texture & { isCompressedTexture?: boolean; mipmaps?: { data?: ArrayBufferView; width?: number }[] }
  if (ct.isCompressedTexture && ct.mipmaps) {
    let bytes = 0
    for (const m of ct.mipmaps) bytes += m.data?.byteLength ?? 0
    return { bytes, side: ct.mipmaps[0]?.width ?? 0 }
  }
  const img = t.image as { width?: number; height?: number } | undefined
  const w = img?.width ?? 0
  const h = img?.height ?? 0
  if (!w || !h) return { bytes: 0, side: 0 }
  return { bytes: w * h * 4 * (t.generateMipmaps ? 1.333 : 1), side: Math.max(w, h) }
}

function textureStats(game: Game): Pick<BenchResult, 'textureMB' | 'textureMBScene' | 'texHist'> {
  const props = game.engine.renderer.properties
  const est = estimateTextureBytes(game.engine.scene, (t) => (props.get(t) as { __version?: number }).__version !== undefined)
  const order = Object.keys(est.hist).sort((a, b) => (b === '<512' ? -1 : a === '<512' ? 1 : Number(b) - Number(a)))
  return {
    textureMB: round(est.uploaded / 1048576, 1),
    textureMBScene: round(est.scene / 1048576, 1),
    texHist: order.map((k) => `${k}:${est.hist[k]}`).join(' '),
  }
}
