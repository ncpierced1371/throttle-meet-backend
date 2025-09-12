import appleSigninAuth from 'apple-signin-auth';
import fs from 'fs';
import path from 'path';


const teamId = process.env.APPLE_TEAM_ID;
const clientId = process.env.APPLE_CLIENT_ID;
const keyId = process.env.APPLE_KEY_ID;

if (!teamId || !clientId || !keyId) {
  throw new Error('Missing required Apple Auth environment variables: APPLE_TEAM_ID, APPLE_CLIENT_ID, APPLE_KEY_ID');
}

const teamIdStr = teamId!;
const clientIdStr = clientId!;
const keyIdStr = keyId!;

if (!teamId || !clientId || !keyId) {
  throw new Error('Missing required Apple Auth environment variables: APPLE_TEAM_ID, APPLE_CLIENT_ID, APPLE_KEY_ID');
}

// Load private key from file or env
let privateKey = process.env.APPLE_PRIVATE_KEY;
if (!privateKey && process.env.APPLE_PRIVATE_KEY_PATH) {
  privateKey = fs.readFileSync(path.resolve(process.env.APPLE_PRIVATE_KEY_PATH), 'utf8');
}

export async function verifyAppleToken(identityToken: string) {
  return appleSigninAuth.verifyIdToken(identityToken, {
    audience: clientId,
    clientID: clientId,
  });
}

export async function getAppleClientSecret() {
  return appleSigninAuth.getClientSecret({
    clientID: clientIdStr,
    teamID: teamIdStr,
    keyIdentifier: keyIdStr,
    privateKey,
  });
}
