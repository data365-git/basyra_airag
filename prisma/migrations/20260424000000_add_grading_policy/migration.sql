-- CreateTable
CREATE TABLE "grading_policy" (
    "id" TEXT NOT NULL,
    "on_time_pct" INTEGER NOT NULL DEFAULT 100,
    "same_day_pct" INTEGER NOT NULL DEFAULT 90,
    "per_day_late_penalty_pct" INTEGER NOT NULL DEFAULT 20,
    "late_floor_pct" INTEGER NOT NULL DEFAULT 10,
    "early_bonus_pct" INTEGER NOT NULL DEFAULT 0,
    "early_bonus_days" INTEGER NOT NULL DEFAULT 2,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by_id" TEXT,

    CONSTRAINT "grading_policy_pkey" PRIMARY KEY ("id")
);

-- Seed default grading policy
INSERT INTO grading_policy (id, on_time_pct, same_day_pct, per_day_late_penalty_pct, late_floor_pct, early_bonus_pct, early_bonus_days, updated_at)
VALUES ('default-grading-policy', 100, 90, 20, 10, 0, 2, NOW())
ON CONFLICT (id) DO NOTHING;
