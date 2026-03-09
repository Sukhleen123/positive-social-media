import { createCanvas } from 'canvas';
import { writeFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const iconsDir = path.resolve(__dirname, '../icons');
mkdirSync(iconsDir, { recursive: true });

for (const size of [16, 48, 128]) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');

  // Indigo-400 background circle
  ctx.fillStyle = '#818cf8';
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
  ctx.fill();

  if (size >= 48) {
    // Shield emoji centered
    const fontSize = Math.round(size * 0.55);
    ctx.font = `${fontSize}px serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🛡️', size / 2, size / 2 + size * 0.03);
  } else {
    // Small white dot for 16px
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 4, 0, Math.PI * 2);
    ctx.fill();
  }

  const outPath = path.resolve(iconsDir, `icon${size}.png`);
  writeFileSync(outPath, canvas.toBuffer('image/png'));
  console.log(`Generated ${outPath}`);
}
