import sharp from 'sharp';
import { randomUUID } from 'node:crypto';
import { type Database, load, save } from './db.js';
import { fail, permitted } from './domain.js';

export async function replaceImage(
  db: Database,
  userId: string,
  kind: string,
  ownerId: string,
  input: Buffer,
) {
  if (!['menu', 'logo'].includes(kind)) fail('Unknown image type.', 404);
  if (!input.length || input.length > 5 * 1024 * 1024) fail('Choose an image under 5 MB.');
  let encoded: Buffer;
  try {
    const source = sharp(input, { limitInputPixels: 25_000_000, animated: false });
    const metadata = await source.metadata();
    if (!['jpeg', 'png', 'webp'].includes(metadata.format ?? ''))
      fail('Use a JPEG, PNG, or WebP image.');
    encoded = await source
      .rotate()
      .resize({
        width: kind === 'logo' ? 600 : 1200,
        height: kind === 'logo' ? 600 : 1200,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: 85 })
      .toBuffer();
  } catch {
    fail('The image could not be read. Use a JPEG, PNG, or WebP under 5 MB.');
  }
  return db.transaction(async (tx) => {
    const s = await load(tx),
      before = structuredClone(s);
    const user = s.users.find((u) => u.id === userId) ?? fail('Sign in again.', 401);
    permitted(user, kind === 'logo' ? ['owner'] : ['owner', 'manager']);
    const record =
      kind === 'logo'
        ? s.settings.find((v) => v.id === ownerId)
        : s.menu.find((v) => v.id === ownerId);
    if (!record) fail('Image owner not found.', 404);
    const version = randomUUID();
    // One row per owner: replacement overwrites the old bytes, with no orphan image record.
    await tx.query(
      'INSERT INTO images(owner_key,version,content) VALUES($1,$2,$3) ON CONFLICT(owner_key) DO UPDATE SET version=EXCLUDED.version,content=EXCLUDED.content',
      [`${kind}:${ownerId}`, version, encoded.toString('base64')],
    );
    if (kind === 'logo') s.settings[0].logoVersion = version;
    else s.menu.find((v) => v.id === ownerId)!.imageVersion = version;
    s.audit.push({
      id: randomUUID(),
      userId: user.id,
      at: new Date().toISOString(),
      action: `${kind}.image.replace`,
      targetId: ownerId,
    });
    await save(tx, s, before);
    return { version };
  });
}
