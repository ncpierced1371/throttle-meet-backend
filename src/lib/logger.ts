export function logRequest(req: any) {
  const { method, url, headers, body } = req;
  console.log(`[${new Date().toISOString()}] ${method} ${url} - IP: ${headers['x-forwarded-for'] || headers['remote_addr'] || 'unknown'}`);
  if (body) console.log('Body:', JSON.stringify(body));
}

export function logError(error: any, context?: string) {
  console.error(`[${new Date().toISOString()}] ERROR${context ? ' [' + context + ']' : ''}:`, error);
}
