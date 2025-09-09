// api/upload.ts
// Upload endpoint

import { VercelRequest, VercelResponse } from '@vercel/node';
export const uploadHandler = (req: VercelRequest, res: VercelResponse) => {
  // Implement upload logic here
  res.send({ uploaded: true });
};
