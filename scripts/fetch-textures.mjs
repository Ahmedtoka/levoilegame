// Downloads the CC0 PBR source textures (ambientCG, 1K JPG zips) for the night-mall
// texture library and unpacks the maps we use into tools/textures-src/<name>/
// (git-ignored): color.jpg, normal.jpg (OpenGL convention) and roughness.jpg.
//
//   node scripts/fetch-textures.mjs [--only <name>] [--force]
//
// Then: .venv/Scripts/python scripts/optimize-images.py --pbr   (writes the WebPs under
// public/textures/pbr/<name>/). The asset ids are recorded in public/textures/pbr/SOURCES.md.
//
// No dependencies: the zips are read with a minimal ZIP parser (stored / deflate entries).

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { inflateRawSync } from 'node:zlib'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'tools', 'textures-src')

/** Library name → ambientCG asset id (all CC0, https://ambientcg.com/). Keep in sync with SOURCES.md and src/engine/pbr.ts. */
export const PBR_SOURCES = {
  'marble-dark': 'Marble016',
  'marble-cream': 'Marble014',
  'oak-dark': 'Wood049',
  'bronze-brushed': 'Metal009',
  'plaster-cream': 'Plaster003',
  'velvet-plum': 'Fabric036',
  'carpet-dark': 'Carpet016',
  'concrete-dark': 'Concrete017',
  'leather-tan': 'Leather023',
}

/** Map file suffix inside the zip → our map name. */
const MAPS = [
  [/_Color\.(jpe?g|png)$/i, 'color'],
  [/_NormalGL\.(jpe?g|png)$/i, 'normal'],
  [/_Roughness\.(jpe?g|png)$/i, 'roughness'],
]

const args = process.argv.slice(2)
const force = args.includes('--force')
const onlyIdx = args.indexOf('--only')
const only = onlyIdx >= 0 ? args[onlyIdx + 1] : null

function zipEntries(buf) {
  // End of central directory record.
  let eocd = -1
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--)
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i
      break
    }
  if (eocd < 0) throw new Error('not a zip file')
  const count = buf.readUInt16LE(eocd + 10)
  let p = buf.readUInt32LE(eocd + 16)
  const entries = []
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('bad central directory')
    const method = buf.readUInt16LE(p + 10)
    const csize = buf.readUInt32LE(p + 20)
    const usize = buf.readUInt32LE(p + 24)
    const nameLen = buf.readUInt16LE(p + 28)
    const extraLen = buf.readUInt16LE(p + 30)
    const commentLen = buf.readUInt16LE(p + 32)
    const local = buf.readUInt32LE(p + 42)
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen)
    entries.push({ name, method, csize, usize, local })
    p += 46 + nameLen + extraLen + commentLen
  }
  return entries
}

function zipRead(buf, e) {
  if (buf.readUInt32LE(e.local) !== 0x04034b50) throw new Error(`bad local header for ${e.name}`)
  const nameLen = buf.readUInt16LE(e.local + 26)
  const extraLen = buf.readUInt16LE(e.local + 28)
  const start = e.local + 30 + nameLen + extraLen
  const data = buf.subarray(start, start + e.csize)
  if (e.method === 0) return data
  if (e.method === 8) return inflateRawSync(data)
  throw new Error(`unsupported zip method ${e.method} for ${e.name}`)
}

async function download(url) {
  const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 (District 122 texture fetch)' }, redirect: 'follow' })
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`)
  return Buffer.from(await res.arrayBuffer())
}

let bytes = 0
for (const [name, asset] of Object.entries(PBR_SOURCES)) {
  if (only && only !== name) continue
  const dir = join(OUT, name)
  mkdirSync(dir, { recursive: true })
  const have = MAPS.every(([, m]) => existsSync(join(dir, `${m}.jpg`)))
  if (have && !force) {
    console.log(`${name}: already unpacked (${asset})`)
    continue
  }
  const zipPath = join(dir, `${asset}_1K-JPG.zip`)
  let zip
  if (existsSync(zipPath) && !force) zip = readFileSync(zipPath)
  else {
    const url = `https://ambientcg.com/get?file=${asset}_1K-JPG.zip`
    process.stdout.write(`${name}: downloading ${asset} … `)
    zip = await download(url)
    writeFileSync(zipPath, zip)
    console.log(`${(zip.length / 1e6).toFixed(1)} MB`)
  }
  bytes += zip.length
  const entries = zipEntries(zip)
  const found = []
  for (const [re, map] of MAPS) {
    const e = entries.find((x) => re.test(x.name))
    if (!e) {
      console.warn(`  ${name}: no ${map} map in ${asset} (${entries.map((x) => x.name).join(', ')})`)
      continue
    }
    writeFileSync(join(dir, `${map}.jpg`), zipRead(zip, e))
    found.push(map)
  }
  console.log(`  ${name}: ${found.join(', ')}`)
}
console.log(`done (${(bytes / 1e6).toFixed(1)} MB of zips in ${OUT})`)
