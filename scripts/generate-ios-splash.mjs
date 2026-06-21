import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(__dirname, '..')
const logoPath = join(projectRoot, 'public', 'brand', 'gatita-logo.png')
const fontPath = join(projectRoot, 'app', 'fonts', 'Paperlogy-9Black.woff2')
const splashDir = join(projectRoot, 'public', 'splash')
const tempDir = join(projectRoot, '.tmp-splash')
const chromeProfileDir = join(tempDir, 'chrome-profile')
const chromePath = process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

if (!existsSync(chromePath)) {
  throw new Error(`Chrome executable not found at ${chromePath}. Set CHROME_BIN to override.`)
}

const logoBase64 = readFileSync(logoPath).toString('base64')
const fontBase64 = readFileSync(fontPath).toString('base64')

const devices = [
  { file: 'iphone-17-pro-max.png', width: 1320, height: 2868 },
  { file: 'iphone-17-air.png', width: 1260, height: 2736 },
  { file: 'iphone-17-pro.png', width: 1206, height: 2622 },
  { file: 'iphone-16-pro-max.png', width: 1320, height: 2868 },
  { file: 'iphone-16-pro.png', width: 1206, height: 2622 },
  { file: 'iphone-15-pro-max.png', width: 1290, height: 2796 },
  { file: 'iphone-14-plus.png', width: 1284, height: 2778 },
  { file: 'iphone-14.png', width: 1170, height: 2532 },
  { file: 'iphone-15.png', width: 1179, height: 2556 },
  { file: 'iphone-13-mini.png', width: 1080, height: 2340 },
  { file: 'iphone-xs-max.png', width: 1242, height: 2688 },
  { file: 'iphone-xr.png', width: 828, height: 1792 },
  { file: 'iphone-x.png', width: 1125, height: 2436 },
  { file: 'iphone-8-plus.png', width: 1242, height: 2208 },
  { file: 'iphone-se.png', width: 750, height: 1334 },
  { file: 'iphone-5.png', width: 640, height: 1136 },
]

function pageHtml({ width, height }) {
  const logoSize = Math.round(Math.min(width * 0.32, height * 0.16))
  const gap = Math.round(height * 0.022)
  const wordmarkSize = Math.round(width * 0.148)

  return `<!doctype html>
<html lang="ko">
  <head>
    <meta charset="utf-8" />
    <style>
      @font-face {
        font-family: "Paperlogy Splash";
        src: url("data:font/woff2;base64,${fontBase64}") format("woff2");
        font-weight: 900;
        font-style: normal;
        font-display: block;
      }

      html,
      body {
        width: ${width}px;
        height: ${height}px;
        margin: 0;
        overflow: hidden;
      }

      body {
        background:
          radial-gradient(${Math.round(width * 0.95)}px ${Math.round(width * 0.86)}px at 18% 8%, rgba(219, 234, 255, 0.96), rgba(219, 234, 255, 0) 64%),
          radial-gradient(${Math.round(width * 0.9)}px ${Math.round(width * 0.82)}px at 86% 80%, rgba(240, 223, 250, 0.9), rgba(240, 223, 250, 0) 66%),
          linear-gradient(180deg, rgb(249, 252, 255) 0%, rgb(246, 249, 255) 58%, rgb(250, 247, 255) 100%);
        color: rgb(5, 11, 29);
      }

      .brand {
        position: absolute;
        top: 46%;
        left: 50%;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: ${gap}px;
        width: 100%;
        transform: translate(-50%, -50%);
      }

      .logo {
        width: ${logoSize}px;
        height: ${logoSize}px;
        object-fit: contain;
        filter: drop-shadow(0 ${Math.round(height * 0.012)}px ${Math.round(width * 0.032)}px rgba(31, 78, 200, 0.18));
      }

      .wordmark {
        font-family: "Paperlogy Splash", -apple-system, BlinkMacSystemFont, sans-serif;
        font-size: ${wordmarkSize}px;
        font-weight: 900;
        line-height: 0.98;
        letter-spacing: 0;
        white-space: nowrap;
        text-align: center;
        text-rendering: geometricPrecision;
        -webkit-font-smoothing: antialiased;
      }
    </style>
  </head>
  <body>
    <main class="brand" aria-label="같이타">
      <img class="logo" src="data:image/png;base64,${logoBase64}" alt="" />
      <div class="wordmark">같이타</div>
    </main>
  </body>
</html>`
}

mkdirSync(splashDir, { recursive: true })
rmSync(tempDir, { recursive: true, force: true })
mkdirSync(chromeProfileDir, { recursive: true })

for (const device of devices) {
  const tempHtmlPath = join(tempDir, device.file.replace(/\.png$/, '.html'))
  const outputPath = join(splashDir, device.file)

  writeFileSync(tempHtmlPath, pageHtml(device), 'utf8')
  const result = spawnSync(chromePath, [
    '--headless=new',
    '--disable-gpu',
    '--disable-background-networking',
    '--disable-extensions',
    '--hide-scrollbars',
    '--no-first-run',
    '--no-default-browser-check',
    '--run-all-compositor-stages-before-draw',
    '--virtual-time-budget=1000',
    `--user-data-dir=${chromeProfileDir}`,
    '--force-device-scale-factor=1',
    `--window-size=${device.width},${device.height}`,
    `--screenshot=${outputPath}`,
    pathToFileURL(tempHtmlPath).href,
  ], { stdio: 'ignore', timeout: 12000 })

  if (result.error && result.error.code !== 'ETIMEDOUT') {
    throw result.error
  }

  if (!existsSync(outputPath)) {
    throw new Error(`Failed to create ${outputPath}`)
  }
}

rmSync(tempDir, { recursive: true, force: true })
