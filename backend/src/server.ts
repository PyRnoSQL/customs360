import express from 'express';
import cors from 'cors';
import path from 'path';
import 'dotenv/config';
import apiRouter from './routes/api';

const app = express();

app.use(cors());
app.use(express.json());

// ── API routes ────────────────────────────────────────────────────────────────
app.use('/api', apiRouter);

// ── Serve React PWA (built by Vite) ──────────────────────────────────────────
const frontendDist = path.join(__dirname, '../../frontend/dist');
app.use(express.static(frontendDist, {
  maxAge: '1y',
  immutable: true,
  setHeaders: (res, filePath) => {
    // Hashed assets (index-BnyescDm.js) can be cached forever
    // But index.html must NEVER be cached — it references the bundle filenames
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
  }
}));
app.get('*', (_req, res) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.sendFile(path.join(frontendDist, 'index.html'));
});

const PORT = Number(process.env.PORT ?? 3001);
app.listen(PORT, () => {
  console.log(`\n🚀 CUSTOMS360 running on port ${PORT}`);
  console.log(`   Sheet ID: ${process.env.GOOGLE_SHEET_ID ?? '⚠️  NOT SET'}`);
  console.log(`   Groq key: ${process.env.GROQ_API_KEY ? '✅ set' : '⚠️  NOT SET'}`);
});
