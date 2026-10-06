// App icon and splash sources for the native shell: renders assets/*.png from inline SVG,
// then `npx capacitor-assets generate --android` cuts every density from them.
import sharp from 'sharp'
import { mkdirSync } from 'node:fs'

const PLUM = '#5b2b82'
const GOLD = '#c8a46e'
const CREAM = '#fbf6f8'
const serif = "Georgia, 'Playfair Display', serif"

// The mark sits inside the adaptive icon's safe zone (centre 2/3).
const mark = (size, fill) => `
  <text x="${size / 2}" y="${size * 0.555}" text-anchor="middle" font-family="${serif}" font-size="${size * 0.3}" font-weight="700" letter-spacing="-${size * 0.008}" fill="${fill}">122</text>
  <rect x="${size * 0.36}" y="${size * 0.615}" width="${size * 0.28}" height="${size * 0.012}" fill="${GOLD}"/>`
const svg = (size, body) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${body}</svg>`)
const bg = (size, fill) => `<rect width="${size}" height="${size}" fill="${fill}"/>`

const splash = (size, back, ink, sub) =>
  svg(
    size,
    `${bg(size, back)}
  <text x="${size / 2}" y="${size * 0.5}" text-anchor="middle" font-family="${serif}" font-size="${size * 0.085}" font-weight="700" fill="${ink}">122</text>
  <rect x="${size * 0.47}" y="${size * 0.52}" width="${size * 0.06}" height="${size * 0.0025}" fill="${GOLD}"/>
  <text x="${size / 2}" y="${size * 0.555}" text-anchor="middle" font-family="${serif}" font-size="${size * 0.024}" letter-spacing="${size * 0.008}" fill="${sub}">DISTRICT</text>`,
  )

mkdirSync('assets', { recursive: true })
const out = (name, buf) => sharp(buf).png().toFile(`assets/${name}.png`)
await Promise.all([
  out('icon-only', svg(1024, bg(1024, PLUM) + mark(1024, '#fff'))),
  out('icon-foreground', svg(1024, mark(1024, '#fff'))),
  out('icon-background', svg(1024, bg(1024, PLUM))),
  out('splash', splash(2732, CREAM, PLUM, '#2a1f33')),
  out('splash-dark', splash(2732, '#1d1524', '#fff', '#e9dff2')),
])
console.log('assets/ written')
