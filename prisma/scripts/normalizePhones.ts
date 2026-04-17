/**
 * One-off backfill: normalize all Participant.phone values to E.164.
 *
 * Run with: npx tsx prisma/scripts/normalizePhones.ts
 * Dry-run first (no writes):
 *   DRY_RUN=true npx tsx prisma/scripts/normalizePhones.ts
 */

import prisma from "../../src/lib/prisma";
import { tryNormalizePhone } from "../../src/lib/phone";

const DRY_RUN = process.env.DRY_RUN === "true";

async function main() {
  const participants = await prisma.participant.findMany({
    where:  { phone: { not: null } },
    select: { id: true, fullName: true, phone: true },
  });

  console.log(`Found ${participants.length} participants with phones.`);

  let updated = 0;
  let skipped = 0;
  const problems: string[] = [];

  for (const p of participants) {
    const canonical = tryNormalizePhone(p.phone);
    if (!canonical) {
      problems.push(`  [UNPARSEABLE] ${p.id} — ${p.fullName}: "${p.phone}"`);
      skipped++;
      continue;
    }
    if (canonical === p.phone) continue; // already canonical

    console.log(`  ${DRY_RUN ? "[DRY]" : "[UPDATE]"} ${p.fullName}: "${p.phone}" → "${canonical}"`);
    if (!DRY_RUN) {
      await prisma.participant.update({
        where: { id: p.id },
        data:  { phone: canonical },
      }).catch((e) => {
        problems.push(`  [ERROR] ${p.id} — ${p.fullName}: ${(e as Error).message}`);
        skipped++;
      });
    }
    updated++;
  }

  console.log(`\nDone. ${updated} updated, ${skipped} skipped.`);
  if (problems.length) {
    console.warn("\n⚠️  Problems (require manual cleanup):");
    problems.forEach((l) => console.warn(l));
  }
  if (DRY_RUN) console.log("\n(dry run — no changes written)");
}

main().catch(console.error).finally(() => prisma.$disconnect());
