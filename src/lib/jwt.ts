
import { SignJWT, jwtVerify } from "jose";
const alg = "HS256";

export async function signAccessToken(payload: object, secret: string, minutes = 15) {
  const exp = Math.floor(Date.now() / 1000) + minutes * 60;
  return new SignJWT({ ...payload, exp, typ: "access" })
    .setProtectedHeader({ alg })
    .sign(new TextEncoder().encode(secret));
}

export async function signRefreshToken(payload: object, secret: string, days = 30) {
  const exp = Math.floor(Date.now() / 1000) + days * 24 * 60 * 60;
  return new SignJWT({ ...payload, exp, typ: "refresh" })
    .setProtectedHeader({ alg })
    .sign(new TextEncoder().encode(secret));
}

export async function verifyToken(token: string, secret: string) {
  const { payload } = await jwtVerify(token, new TextEncoder().encode(secret));
  return payload;
}
