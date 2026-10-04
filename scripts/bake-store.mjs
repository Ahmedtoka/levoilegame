#!/usr/bin/env node
// Bakes EL_REBAT_Render.blend into public/models/mall/store.glb.
// Each stage runs in a fresh Blender process and is retried if Blender crashes
// (Cycles' bake sync is occasionally unstable on fresh UV layers).
//
//   node scripts/bake-store.mjs                      # 4096 px atlases, 256 samples
//   node scripts/bake-store.mjs --res 1024 --samples 16 --out <dir>   # quick test
//   node scripts/bake-store.mjs --from bake:soft     # resume from a stage

import { spawn } from 'node:child_process'
import readline from 'node:readline'
import { existsSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const BLENDER = process.env.BLENDER ?? path.join(ROOT, 'tools/blender-4.2.23-windows-x64/blender.exe')
const SOURCE = path.join(ROOT, 'EL_REBAT_Render.blend')
const SCRIPT = path.join(ROOT, 'scripts/blender/export_store.py')

const argv = process.argv.slice(2)
const opt = (name, def) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : def)
const res = opt('--res', '4096')
const samples = opt('--samples', '256')
const out = path.resolve(opt('--out', path.join(ROOT, 'public/models/mall')))
const from = opt('--from', 'prep')
const workDir = path.resolve(opt('--work', path.join(ROOT, 'tools/bake-work')))
const work = path.join(workDir, 'work.blend')

const stages = [
  { id: 'prep', file: SOURCE, args: ['--stage', 'prep'] },
  ...['arch', 'ceiling', 'fixtures', 'soft', 'hardware'].map((g) => ({ id: `bake:${g}`, file: work, args: ['--stage', 'bake', '--group', g] })),
  { id: 'export', file: work, args: ['--stage', 'export'] },
  { id: 'kit', file: work, args: ['--stage', 'kit'] },
]

let started = false
for (const st of stages) {
  if (st.id === from) started = true
  if (!started) continue
  let ok = false
  for (let attempt = 1; attempt <= 4 && !ok; attempt++) {
    const t = Date.now()
    console.log(`\n▶ ${st.id} (attempt ${attempt})`)
    const r = await run(st, attempt > 1)
    ok = r.code === 0 && r.stageOk
    console.log(ok ? `✓ ${st.id} in ${((Date.now() - t) / 1000).toFixed(0)}s` : `✗ ${st.id} failed (exit ${r.code})`)
  }
  if (!ok) {
    console.error(`Stage ${st.id} failed after retries.`)
    process.exit(1)
  }
}
function run(st, safe) {
  return new Promise((resolve) => {
    const p = spawn(BLENDER, ['-b', st.file, '-P', SCRIPT, '--', ...st.args, '--res', res, '--samples', samples, '--out', out, '--work', workDir, '--safe', safe ? '1' : '0'])
    let stageOk = false
    for (const stream of [p.stdout, p.stderr]) {
      readline.createInterface({ input: stream }).on('line', (l) => {
        if (/STAGE_OK/.test(l)) stageOk = true
        if (/^\[|Error|Traceback|File "/.test(l)) console.log('  ' + l)
      })
    }
    p.on('close', (code) => resolve({ code, stageOk }))
  })
}

const glb = path.join(out, 'store.glb')
if (existsSync(glb)) console.log(`\nDone: ${glb} (${(statSync(glb).size / 1e6).toFixed(1)} MB)`)
