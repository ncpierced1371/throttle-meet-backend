// api/webhooks.ts
// Webhooks endpoint

import { VercelRequest, VercelResponse } from '@vercel/node';
export const webhooksHandler = (req: VercelRequest, res: VercelResponse) => {
  // Implement webhooks logic here
  res.send({ received: true });
};
