import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { createServer as createHttpServer } from 'node:http';
import { database, migrate } from './db.js';
import { createApp, errorHandler } from './app.js';
import { scheduleBackups } from './backup.js';
const db = await database();
await migrate(db);
const { app, close } = createApp(db);
const server = createHttpServer(app);
if (process.env.NODE_ENV !== 'production') {
  const { createServer } = await import('vite');
  const vite = await createServer({
    server: { middlewareMode: true, hmr: { server } },
    appType: 'spa',
  });
  app.use(vite.middlewares);
} else {
  if (!existsSync('dist/index.html'))
    throw new Error('Build the frontend before starting production.');
  app.use(express.static('dist'));
  app.get('/{*path}', (_req, res) => res.sendFile(path.resolve('dist/index.html')));
}
app.use(errorHandler);
server.listen(Number(process.env.PORT ?? 3000), process.env.HOST ?? '0.0.0.0', () =>
  console.log(`FUDO is ready at http://localhost:${process.env.PORT ?? 3000}`),
);
server.on('error', async (error) => {
  console.error(error);
  close();
  await db.close();
  process.exit(1);
});
const stopBackups = scheduleBackups(db);
for (const signal of ['SIGTERM', 'SIGINT'])
  process.on(signal, () => {
    stopBackups();
    close();
    server.close(() => void db.close().then(() => process.exit(0)));
  });
