/**
 * logSubmissionEvent — write an event to submission_events.
 *
 * Designed to be called inside the same Prisma transaction as the
 * main mutation so events are never orphaned.
 *
 * Usage:
 *   await prisma.$transaction(async (tx) => {
 *     // ... main mutation ...
 *     await logSubmissionEvent(tx, { ... });
 *   });
 *
 * Or outside a transaction (fire-and-forget acceptable):
 *   await logSubmissionEvent(prisma, { ... });
 */

import { type PrismaClient, SubmissionEventType } from "@prisma/client";

export { SubmissionEventType };

type PrismaTx = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

interface LogEventParams {
  submissionId: string;
  actorId:      string;  // StaffUser.id or Participant.id
  actorRole:    "participant" | "curator" | "admin";
  actorName:    string;  // display name, captured at write time
  eventType:    SubmissionEventType;
  meta?:        Record<string, unknown>;
}

export async function logSubmissionEvent(
  db: PrismaClient | PrismaTx,
  params: LogEventParams,
): Promise<void> {
  try {
    await (db as PrismaTx).submissionEvent.create({
      data: {
        submissionId: params.submissionId,
        actorId:      params.actorId,
        actorRole:    params.actorRole,
        actorName:    params.actorName,
        eventType:    params.eventType,
        meta:         params.meta ? (params.meta as object) : undefined,
      },
    });
  } catch (err) {
    // Never let event logging crash a mutation
    console.error("[submissionEvents] failed to log event:", err);
  }
}
