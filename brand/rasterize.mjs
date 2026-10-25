// Converte gli SVG del marchio nei PNG per PWA e per @capacitor/assets.
// Uso: node brand/rasterize.mjs && npx capacitor-assets generate
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';

const b = (f) => new URL(`./${f}`, import.meta.url).pathname;
const out = (f) => new URL(`../${f}`, import.meta.url).pathname;
mkdirSync(out('assets'), { recursive: true });
mkdirSync(out('public/icons'), { recursive: true });

const jobs = [
  ['ponte-icon.svg', 'public/icons/icon-192.png', 192],
  ['ponte-icon.svg', 'public/icons/icon-512.png', 512],
  ['ponte-icon-maskable.svg', 'public/icons/icon-maskable-512.png', 512],
  ['ponte-icon.svg', 'public/icons/apple-touch-icon.png', 180],
  // sorgenti per @capacitor/assets (icone e splash Android/iOS)
  ['ponte-icon.svg', 'assets/icon-only.png', 1024],
  ['ponte-icon-foreground.svg', 'assets/icon-foreground.png', 1024],
  ['ponte-splash.svg', 'assets/splash.png', 2732],
  ['ponte-splash-dark.svg', 'assets/splash-dark.png', 2732],
];
for (const [src, dst, size] of jobs) {
  await sharp(b(src), { density: 300 }).resize(size, size).png().toFile(out(dst));
  console.log(dst);
}
await sharp({ create: { width: 1024, height: 1024, channels: 4, background: '#FF6A13' } }).png().toFile(out('assets/icon-background.png'));
console.log('assets/icon-background.png');
