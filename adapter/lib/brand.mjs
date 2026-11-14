// Original Cindy login artwork for the sign-in page, copied from the renderer
// build by scripts/build-fpk.sh under stable names (the renderer's names carry
// build hashes, and the Host is stopped while signing in).
import fs from 'node:fs/promises';
import path from 'node:path';

export const BRAND_IMAGES = ['hero@2x', 'wordmark@2x', 'wordmark-dark@2x', 'slogan@2x', 'slogan-dark@2x'];

/** PNG bytes for an allowed image name, or null (unknown name or not packaged). */
export async function readBrandImage(dir, name) {
  if (!dir || !BRAND_IMAGES.includes(name)) return null;
  try { return await fs.readFile(path.join(dir, `${name}.png`)); } catch { return null; }
}
