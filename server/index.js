import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import { createStore } from './store.js';
import { createApp } from './app.js';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(root, '.env') });
// Local development can reuse the existing public account configuration.
// These two fields are the only settings read from the sibling API project.
const siblingFile = path.join(root, '../server/.env');
const siblingAuth =
  process.env.NODE_ENV !== 'production' && fs.existsSync(siblingFile)
    ? dotenv.parse(fs.readFileSync(siblingFile))
    : {};
const config = {
  dataDir: path.resolve(root, process.env.TEACHER_DATA_DIR || 'data'),
  teacherOrigin: process.env.TEACHER_ORIGIN || 'http://127.0.0.1:5175',
  studentOrigin: process.env.STUDENT_ORIGIN || 'http://127.0.0.1:5173',
  pastqApi: (process.env.PASTQ_API_URL || 'http://127.0.0.1:3000').replace(/\/$/, ''),
  supabaseUrl:
    process.env.SUPABASE_URL ||
    process.env.VITE_SUPABASE_URL ||
    siblingAuth.SUPABASE_URL ||
    siblingAuth.VITE_SUPABASE_URL,
  supabaseKey:
    process.env.SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    siblingAuth.SUPABASE_ANON_KEY ||
    siblingAuth.VITE_SUPABASE_PUBLISHABLE_KEY,
  teacherIds: process.env.TEACHER_USER_IDS,
  staticDir: path.join(root, 'dist'),
  trustProxy: process.env.NODE_ENV === 'production' ? 1 : false,
  bachs: {
    apiKey: process.env.BACHS_API_KEY,
    webhookSecret: process.env.BACHS_WEBHOOK_SECRET,
    environment: process.env.BACHS_ENVIRONMENT || 'sandbox',
  },
};
if (!['sandbox', 'live'].includes(config.bachs.environment))
  throw new Error('BACHS_ENVIRONMENT must be sandbox or live.');
if (process.env.NODE_ENV === 'production') {
  for (const origin of [config.teacherOrigin, config.studentOrigin])
    if (!origin.startsWith('https://'))
      throw new Error('Production frontend origins must use HTTPS.');
  if (!config.pastqApi.startsWith('https://'))
    throw new Error('Production PASTQ_API_URL must use HTTPS.');
}
const storageSecret = process.env.TEACHER_STORAGE_SECRET || '';
if (storageSecret.length < 32)
  throw new Error('TEACHER_STORAGE_SECRET must contain at least 32 characters.');
const store = createStore(config.dataDir, storageSecret);
const port = Number(process.env.PORT || 3002);
const host = process.env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1';
const server = createApp({ store, config }).listen(port, host, () =>
  console.log(`Focalpoint API on http://${host}:${port}`),
);
function stop() {
  server.close(() => {
    store.close();
    process.exit(0);
  });
  server.closeIdleConnections();
}
process.once('SIGINT', stop);
process.once('SIGTERM', stop);
