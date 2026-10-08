// Rend la vidéo image par image (Chromium headless) puis l'assemble avec ffmpeg.
//   node tools/promo-video/render.mjs stills 3,10,20      -> PNG de contrôle dans ./out/stills
//   node tools/promo-video/render.mjs video [workers]     -> ./out/craft-ts-presentation.mp4
import { chromium } from 'playwright-core';
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const url = pathToFileURL(path.join(here, 'index.html')).href;
const out = path.join(here, 'out');
const FPS = 30;
const [mode, arg] = process.argv.slice(2);

async function openPage(browser) {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  await page.goto(url);
  await page.evaluate(() => window.__ready);
  return page;
}

const browser = await chromium.launch();

if (mode === 'stills') {
  const dir = path.join(out, 'stills');
  mkdirSync(dir, { recursive: true });
  const page = await openPage(browser);
  for (const t of arg.split(',').map(Number)) {
    await page.evaluate((x) => window.__render(x), t);
    await page.screenshot({ path: path.join(dir, `t${String(t).padStart(6, '0')}.png`) });
  }
  console.log('stills ->', dir);
} else if (mode === 'video') {
  const workers = Number(process.argv[4] ?? 4);
  const frames = path.join(out, 'frames');
  if (existsSync(frames)) rmSync(frames, { recursive: true });
  mkdirSync(frames, { recursive: true });
  const probe = await openPage(browser);
  const duration = await probe.evaluate(() => window.DURATION);
  const total = Math.round(duration * FPS);
  console.log(`durée ${duration}s -> ${total} images, ${workers} workers`);
  await Promise.all(
    Array.from({ length: workers }, async (_, w) => {
      const page = await openPage(browser);
      for (let i = w; i < total; i += workers) {
        await page.evaluate((x) => window.__render(x), i / FPS);
        await page.screenshot({ path: path.join(frames, `f${String(i).padStart(5, '0')}.png`) });
        if (i % 150 === w) console.log(`  image ${i}/${total}`);
      }
    }),
  );
  const mp4 = path.join(out, 'craft-ts-presentation.mp4');
  execFileSync('ffmpeg', ['-y', '-framerate', String(FPS), '-i', path.join(frames, 'f%05d.png'),
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', mp4], { stdio: 'inherit' });
  console.log('vidéo ->', mp4);
}
await browser.close();
