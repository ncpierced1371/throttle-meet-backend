// api/upload.ts
// Upload endpoint


import { VercelRequest, VercelResponse } from '@vercel/node';
import { setCorsHeaders } from '../src/lib/cors';
import { setSecurityHeaders } from '../src/lib/securityHeaders';
import { checkRateLimit } from '../src/lib/rateLimit';
import { logRequest, logError } from '../src/lib/logger';
import { uploadToCloudinary } from '../src/lib/cloudinary.js';
const Busboy = require('busboy');

const ALLOWED_MIME_TYPES = [
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'video/mp4', 'video/quicktime', 'video/webm',
];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res);
  setSecurityHeaders(res);
  logRequest(req);

  // Rate limiting: 20 uploads per 10 min per IP
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
  const rate = await checkRateLimit({ key: `upload:${ip}`, limit: 20, window: 600 });
  if (!rate.allowed) {
    return res.status(429).json({ success: false, error: 'Rate limit exceeded', reset: rate.reset });
  }

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const busboy = new Busboy({ headers: req.headers });
    let fileBuffer: Buffer | null = null;
    let fileMime: string | null = null;
    let fileName: string | null = null;
    let fileSize = 0;

    busboy.on('file', (
      fieldname: string,
      file: NodeJS.ReadableStream,
      filename: string,
      encoding: string,
      mimetype: string
    ) => {
      if (!ALLOWED_MIME_TYPES.includes(mimetype)) {
        file.resume();
        return res.status(400).json({ success: false, error: 'Invalid file type' });
      }
      fileName = filename;
      fileMime = mimetype;
      const chunks: Buffer[] = [];
      file.on('data', (data: Buffer) => {
        fileSize += data.length;
        if (fileSize > MAX_FILE_SIZE) {
          file.resume();
          return res.status(400).json({ success: false, error: 'File too large' });
        }
        chunks.push(data);
      });
      file.on('end', () => {
        fileBuffer = Buffer.concat(chunks);
      });
    });

    busboy.on('finish', async () => {
      if (!fileBuffer || !fileMime || !fileName) {
        return res.status(400).json({ success: false, error: 'No file uploaded' });
      }
      // TODO: Use sharp for image sanitization if needed
      const uploadResult = await uploadToCloudinary({ buffer: fileBuffer, mimetype: fileMime, filename: fileName });
      logRequest({ ...req, body: { fileName, fileType: fileMime, fileSize } });
      res.status(201).json({ success: true, data: uploadResult });
    });

    req.pipe(busboy);
  } catch (error) {
    logError(error, 'upload');
    res.status(500).json({ success: false, error: 'Internal server error', message: error instanceof Error ? error.message : 'Unknown error' });
  }
}
