// Neon Shores — Cover Maker, handed in for gta6-cover-art-01.
//
// The entry itself is the static web app under app/ (open app/index.html in
// a desktop browser; it runs fully offline). This program is only the
// courier: it copies app/ and screenshots/ into the output directory and
// writes dossier.json there with the kit's vendored library, so the bytes
// the scorer rebuilds and compares are the library's own. Node 22, standard
// library only.
//
// Run it locally the way the grader does, with MAKEFUN_OUTPUT_DIR naming
// the output folder instead of /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-app.ts';

const repoDir = fileURLToPath(new URL('.', import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(outputDir, { recursive: true });
cpSync(join(repoDir, 'app'), join(outputDir, 'app'), { recursive: true });
mkdirSync(join(outputDir, 'screenshots'), { recursive: true });
if (existsSync(join(repoDir, 'screenshots'))) {
  cpSync(join(repoDir, 'screenshots'), join(outputDir, 'screenshots'), { recursive: true });
}

// The caps below are the gate's own, passed to the library so the dossier it
// writes is shaped exactly as the scorer expects: the judge's text view is
// capped, screenshots are at most 4 files of 256 KiB, and app/ is at most
// 993 entries, 48 MiB in all, with no path over 1000 bytes.
const dossier = buildDossier(outputDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  app_max_files: 993,
  app_max_bytes: 50331648,
  app_path_max_bytes: 1000,
});
writeFileSync(join(outputDir, 'dossier.json'), dossier);
