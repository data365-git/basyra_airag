import { cookies } from "next/headers";
import { verifyJWT, COOKIE_NAME } from "@/lib/auth";
import type { JWTPayload } from "@/lib/auth";
import prisma from "@/lib/prisma";
import type { StaffUser } from "@/types";

/** Returns the raw JWT payload (lightweight — no DB hit). */
export async function getUser(): Promise<JWTPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifyJWT(token);
}

/** Returns the full user+role from the DB, mapped to the StaffUser shape. */
export async function getFullUser(): Promise<StaffUser | null> {
  const jwt = await getUser();
  if (!jwt) return null;

  const user = await prisma.staffUser.findUnique({
    where: { id: jwt.sub },
    include: { role: true },
  });

  if (!user || !user.isActive) return null;

  return {
    id: user.id,
    name: user.name,
    username: user.username ?? null,
    email: user.email ?? null,
    avatar_url: user.avatarUrl ?? null,
    role_id: user.roleId,
    role: user.role
      ? {
          id: user.role.id,
          name: user.role.name,
          description: user.role.description,
          color: user.role.color,
          is_superadmin: user.role.isSuperadmin,
          permissions: user.role.permissions as StaffUser["role"] extends { permissions: infer P } ? P : never,
          created_at: user.role.createdAt.toISOString(),
        }
      : null,
    is_active: user.isActive,
    created_at: user.createdAt.toISOString(),
  };
}
