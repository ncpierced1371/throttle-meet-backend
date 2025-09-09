// api/upload.ts
// Upload endpoint

import { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    // For now, return mock URLs - in production you'd integrate with AWS S3, Cloudinary, etc.
    const mockUrls = [
      `https://images.throttlemeet.com/${Date.now()}-1.jpg`,
      `https://images.throttlemeet.com/${Date.now()}-2.jpg`,
    ];

    res.status(200).json({
      success: true,
      data: {
        urls: mockUrls
      }
    });

  } catch (error) {
    console.error('Upload API error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Upload failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
