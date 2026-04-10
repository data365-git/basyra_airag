import { cookies } from "next/headers";
import { verifyJWT, COOKIE_NAME } from "@/lib/auth";
import type { JWTPayload } from "@/lib/auth";

export async function getUser(): Promise<JWTPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifyJWT(token);
}
