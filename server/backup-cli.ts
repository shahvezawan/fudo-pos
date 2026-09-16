import 'dotenv/config';
import { database } from './db.js';
import { backup } from './backup.js';
const db = await database();
try {
  await backup(db);
  console.log('Backup complete.');
} finally {
  await db.close();
}
