import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

/**
 * Maps known Prisma error codes to structured HTTP responses.
 * Returns null if the error is not a known Prisma error (caller should return 500).
 */
export function handlePrismaError(e: unknown): ReturnType<typeof NextResponse.json> | null {
  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    if (e.code === "P2002") {
      // Unique constraint violation
      const field = Array.isArray(e.meta?.target) ? (e.meta.target as string[]).join(", ") : "field";
      return NextResponse.json(
        { error: `Already exists: ${field}` },
        { status: 409 }
      );
    }
    if (e.code === "P2025") {
      // Record not found
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (e.code === "P2003") {
      // Foreign key constraint failed
      return NextResponse.json(
        { error: "Referenced record does not exist" },
        { status: 400 }
      );
    }
  }
  return null;
}
