import fs from 'fs';
import { createCanvas, loadImage } from 'canvas';

const SIZES = {
  'mipmap-mdpi': 48,
  'mipmap-hdpi': 72,
  'mipmap-xhdpi': 96,
  'mipmap-xxhdpi': 144,
  'mipmap-xxxhdpi': 192,
};

const FOREGROUND_SIZES = {
  'mipmap-mdpi': 72,
  'mipmap-hdpi': 108,
  'mipmap-xhdpi': 144,
  'mipmap-xxhdpi': 216,
  'mipmap-xxxhdpi': 288,
};

async function main() {
  const src = 'client/public/icons/icon-512.png';
  const baseDir = 'client/android/app/src/main/res';

  if (!fs.existsSync(src)) {
    console.error('Source icon not found:', src);
    process.exit(1);
  }

  const img = await loadImage(src);

  for (const [dir, size] of Object.entries(SIZES)) {
    const canvas = createCanvas(size, size);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, size, size);
    const outDir = `${baseDir}/${dir}`;
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(`${outDir}/ic_launcher.png`, canvas.toBuffer('image/png'));
    fs.writeFileSync(`${outDir}/ic_launcher_round.png`, canvas.toBuffer('image/png'));
    console.log(`Generated ${dir}/ic_launcher.png (${size}x${size})`);
  }

  // Generate foreground layers (108dp viewport = scale 0.6 for 512px source)
  for (const [dir, size] of Object.entries(FOREGROUND_SIZES)) {
    const canvas = createCanvas(size, size);
    const ctx = canvas.getContext('2d');
    const s = size / 512;
    ctx.save();
    ctx.translate(size * 0.06, size * 0.06);
    ctx.scale(s * 0.8, s * 0.8);
    ctx.drawImage(img, 0, 0);
    ctx.restore();
    const outDir = `${baseDir}/${dir}`;
    fs.writeFileSync(`${outDir}/ic_launcher_foreground.png`, canvas.toBuffer('image/png'));
    console.log(`Generated ${dir}/ic_launcher_foreground.png (${size}x${size})`);
  }

  console.log('Done!');
}

main().catch(console.error);
