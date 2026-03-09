import { copyFileSync, cpSync, mkdirSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const dist = path.resolve(root, 'dist');

mkdirSync(dist, { recursive: true });

// manifest.json
copyFileSync(path.join(root, 'manifest.json'), path.join(dist, 'manifest.json'));
console.log('Copied manifest.json');

// icons/
const iconsDir = path.join(root, 'icons');
const distIcons = path.join(dist, 'icons');
if (existsSync(iconsDir)) {
  cpSync(iconsDir, distIcons, { recursive: true });
  console.log('Copied icons/');
} else {
  console.warn('icons/ directory not found — run npm run generate-icons first');
}

// content.css
const contentCss = path.join(root, 'src', 'content', 'content.css');
copyFileSync(contentCss, path.join(dist, 'content.css'));
console.log('Copied content.css');

// popup/index.html needs asset references fixed — Vite handles this for popup build
// The popup is in dist/popup/ — manifest references popup/index.html ✓
