import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getFullUser } from "@/lib/getUser";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getFullUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const now = new Date();
  const ago7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const ago14 = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

  const [overall, last7d, prev7d, statusCounts] = await Promise.all([
    prisma.botMessageRating.aggregate({
      _avg: { stars: true },
      _count: { _all: true },
    }),
    prisma.botMessageRating.aggregate({
      where: { ratedAt: { gte: ago7 } },
      _avg: { stars: true },
    }),
    prisma.botMessageRating.aggregate({
      where: { ratedAt: { gte: ago14, lt: ago7 } },
      _avg: { stars: true },
    }),
    prisma.botMessageRating.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
  ]);

  const countByStatus = Object.fromEntries(
    statusCounts.map((s) => [s.status, s._count._all])
  );

  const fixedCount = countByStatus["fixed"] ?? 0;
  const wontFixCount = countByStatus["wont_fix"] ?? 0;
  const resolvedTotal = fixedCount + wontFixCount;

  const delta7d =
    last7d._avg.stars != null && prev7d._avg.stars != null
      ? last7d._avg.stars - prev7d._avg.stars
      : null;

  return NextResponse.json({
    avg_stars: overall._avg.stars ?? null,
    avg_stars_7d: last7d._avg.stars ?? null,
    delta_7d: delta7d,
    new_count: countByStatus["new"] ?? 0,
    fixed_rate:
      resolvedTotal > 0 ? Math.round((fixedCount / resolvedTotal) * 100) : null,
    total_rated: overall._count._all,
  });
}
