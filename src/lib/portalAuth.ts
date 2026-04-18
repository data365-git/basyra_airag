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

/**
 * Resolve the authenticated portal user.
 *
 * Checks two sources in order:
 *  1. `Authorization: Bearer <jwt>` header — used by Telegram Mini App webview,
 *     which drops httpOnly cookies in cross-origin contexts.
 *  2. The `attendtrack_portal` httpOnly cookie — used by regular browsers.
 *
 * Pass the incoming `Request` (or `NextRequest`) to enable header auth.
 * Omit it (legacy call sites) and only the cookie is checked.
 */
export async function getPortalUser(req?: Request): Promise<PortalJWTPayload | null> {
  // 1. Authorization header — takes priority (Telegram Mini App)
  if (req) {
    const auth = req.headers.get("Authorization") ?? req.headers.get("authorization");
    if (auth?.startsWith("Bearer ")) {
      const result = await verifyPortalJWT(auth.slice(7));
      if (result) return result;
    }
  }

  // 2. Cookie fallback (standard browser)
  const cookieStore = await cookies();
  const token = cookieStore.get(PORTAL_COOKIE)?.value;
  if (!token) return null;
  return verifyPortalJWT(token);
}
