import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(__dirname, '..')
const logoPath = join(projectRoot, 'public', 'brand', 'gatita-logo.png')
const splashDir = join(projectRoot, 'public', 'splash')
const tempDir = join(projectRoot, '.tmp-splash')

const logoBase64 = readFileSync(logoPath).toString('base64')

const devices = [
  { file: 'iphone-17-pro-max.png', width: 1320, height: 2868 },
  { file: 'iphone-17-air.png', width: 1260, height: 2736 },
  { file: 'iphone-17-pro.png', width: 1206, height: 2622 },
  { file: 'iphone-16-pro-max.png', width: 1320, height: 2868 },
  { file: 'iphone-16-pro.png', width: 1206, height: 2622 },
  { file: 'iphone-15-pro-max.png', width: 1290, height: 2796 },
  { file: 'iphone-14.png', width: 1170, height: 2532 },
  { file: 'iphone-xs-max.png', width: 1242, height: 2688 },
  { file: 'iphone-xr.png', width: 828, height: 1792 },
  { file: 'iphone-x.png', width: 1125, height: 2436 },
  { file: 'iphone-8-plus.png', width: 1242, height: 2208 },
  { file: 'iphone-se.png', width: 750, height: 1334 },
  { file: 'iphone-5.png', width: 640, height: 1136 },
]

function splashSvg({ width, height }) {
  const logoSize = Math.round(Math.min(width, height) * 0.26)
  const logoX = Math.round((width - logoSize) / 2)
  const logoY = Math.round(height * 0.41 - logoSize / 2)
  const wordmarkY = Math.round(logoY + logoSize + height * 0.055)
  const fontSize = Math.round(width * 0.145)

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0%" stop-color="#f7fbff"/>
      <stop offset="52%" stop-color="#eef5ff"/>
      <stop offset="100%" stop-color="#f6f0ff"/>
    </linearGradient>
    <radialGradient id="blue" cx="30%" cy="18%" r="70%">
      <stop offset="0%" stop-color="#dceaff" stop-opacity="0.98"/>
      <stop offset="100%" stop-color="#dceaff" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="mauve" cx="76%" cy="76%" r="64%">
      <stop offset="0%" stop-color="#eadcf4" stop-opacity="0.92"/>
      <stop offset="100%" stop-color="#eadcf4" stop-opacity="0"/>
    </radialGradient>
    <filter id="softShadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="${Math.round(height * 0.012)}" stdDeviation="${Math.round(width * 0.02)}" flood-color="#1f4ec8" flood-opacity="0.16"/>
    </filter>
  </defs>
  <rect width="100%" height="100%" fill="url(#bg)"/>
  <rect width="100%" height="100%" fill="url(#blue)"/>
  <rect width="100%" height="100%" fill="url(#mauve)"/>
  <image href="data:image/png;base64,${logoBase64}" x="${logoX}" y="${logoY}" width="${logoSize}" height="${logoSize}" filter="url(#softShadow)" preserveAspectRatio="xMidYMid meet"/>
  <text x="50%" y="${wordmarkY}" text-anchor="middle" dominant-baseline="hanging" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" font-size="${fontSize}" font-weight="900" fill="#050b1d" letter-spacing="0">같이타</text>
</svg>`
}

mkdirSync(splashDir, { recursive: true })
mkdirSync(tempDir, { recursive: true })

for (const device of devices) {
  const tempSvgPath = join(tempDir, device.file.replace(/\.png$/, '.svg'))
  const outputPath = join(splashDir, device.file)

  writeFileSync(tempSvgPath, splashSvg(device), 'utf8')
  execFileSync('sips', ['-s', 'format', 'png', tempSvgPath, '--out', outputPath], { stdio: 'ignore' })
}

rmSync(tempDir, { recursive: true, force: true })
