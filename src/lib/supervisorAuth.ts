/**
 * Supervisor auth — JWT signing/verification + access guard.
 *
 * Supervisors are external stakeholders (HR, parents, employers) who can view
 * performance data for participants they are explicitly assigned to.
 *
 * Auth cookie: "attendtrack_supervisor"
 * Token contains: sub (supervisorId), email
 */
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import prisma from "@/lib/prisma";

const SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET ?? "dev-secret-change-in-production-min-32-chars!!"
);

export const SUPERVISOR_COOKIE = "attendtrack_supervisor";
const EXPIRY = "30d";

export interface SupervisorJWTPayload {
  sub:   string;  // supervisorId
  email: string;
}

// ─── JWT helpers ──────────────────────────────────────────────────────────────

export async function signSupervisorJWT(payload: SupervisorJWTPayload): Promise<string> {
  return new SignJWT({ ...payload, _role: "supervisor" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(EXPIRY)
    .sign(SECRET);
}

export async function verifySupervisorJWT(token: string): Promise<SupervisorJWTPayload | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET);
    // Distinguish from other token types via the _role claim
    if (payload._role !== "supervisor") return null;
    return {
      sub:   payload.sub   as string,
      email: payload.email as string,
    };
  } catch {
    return null;
  }
}

/**
 * Resolve the authenticated supervisor from cookie or Bearer header.
 *
 * Header takes priority (future mobile/mini-app use); cookie is the default
 * for browser sessions.
 */
export async function getSupervisorUser(req?: Request): Promise<SupervisorJWTPayload | null> {
  // 1. Authorization: Bearer <jwt>
  if (req) {
    const auth = req.headers.get("Authorization") ?? req.headers.get("authorization");
    if (auth?.startsWith("Bearer ")) {
      const result = await verifySupervisorJWT(auth.slice(7));
      if (result) return result;
    }
  }

  // 2. Cookie fallback
  const cookieStore = await cookies();
  const token = cookieStore.get(SUPERVISOR_COOKIE)?.value;
  if (!token) return null;
  return verifySupervisorJWT(token);
}

// ─── Access guard ─────────────────────────────────────────────────────────────

/**
 * Assert that `supervisorId` is allowed to view data for `participantId`.
 *
 * Throws with HTTP 403 if no matching SupervisorAssignment exists.
 * Optionally further scoped to a specific training.
 */
export async function assertSupervisorCanSee(
  supervisorId:  string,
  participantId: string,
  trainingId?:   string,
): Promise<void> {
  const where = trainingId
    ? {
        supervisorId,
        participantId,
        OR: [
          { trainingId },
          { trainingId: null }, // a null-training assignment grants access to ALL trainings
        ],
      }
    : { supervisorId, participantId };

  const assignment = await prisma.supervisorAssignment.findFirst({ where });
  if (!assignment) {
    throw Object.assign(new Error("Forbidden: supervisor not assigned to this participant"), {
      status: 403,
    });
  }
}

/**
 * Return the list of participantIds this supervisor is allowed to see
 * (optionally filtered to a training).
 */
export async function getSupervisorParticipantIds(
  supervisorId: string,
  trainingId?:  string,
): Promise<string[]> {
  const assignments = await prisma.supervisorAssignment.findMany({
    where: trainingId
      ? {
          supervisorId,
          OR: [{ trainingId }, { trainingId: null }],
        }
      : { supervisorId },
    select: { participantId: true },
  });
  return [...new Set(assignments.map((a) => a.participantId))];
}
