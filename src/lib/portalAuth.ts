import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

const SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET ?? "dev-secret-change-in-production-min-32-chars!!"
);

export const PORTAL_COOKIE = "attendtrack_portal";
const EXPIRY = "30d";

export interface PortalJWTPayload {
  sub: string;   // participantId
  username: string;
}

export async function signPortalJWT(payload: PortalJWTPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(EXPIRY)
    .sign(SECRET);
}

export async function verifyPortalJWT(token: string): Promise<PortalJWTPayload | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET);
    // Distinguish portal tokens from admin tokens — admin tokens have `email`, portal tokens have `username`
    if (!payload.username) return null;
    return {
      sub:      payload.sub as string,
      username: payload.username as string,
    };
  } catch {
    return null;
  }
}

export async function getPortalUser(): Promise<PortalJWTPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(PORTAL_COOKIE)?.value;
  if (!token) return null;
  return verifyPortalJWT(token);
}
