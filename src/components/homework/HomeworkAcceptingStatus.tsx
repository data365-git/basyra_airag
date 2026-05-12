"use client";

import { Badge } from "@/components/ui/Badge";
import { fmtUzDate } from "@/lib/dateFormat";
import { getTodayInTashkent } from "@/lib/sessionWindow";

export type HomeworkAcceptingState = "open" | "late_open" | "closed";

export interface HomeworkAcceptingMeta {
  due_date?: string | null;
  accepting_submissions?: boolean | null;
}

export function getHomeworkAcceptingState(
  hw: HomeworkAcceptingMeta,
  today = getTodayInTashkent()
): HomeworkAcceptingState {
  if (hw.accepting_submissions === false) return "closed";
  return hw.due_date && hw.due_date < today ? "late_open" : "open";
}

export function HomeworkAcceptingBadge({ homework }: { homework: HomeworkAcceptingMeta }) {
  const state = getHomeworkAcceptingState(homework);

  if (state === "closed") {
    return <Badge variant="red" dot>Yopiq</Badge>;
  }

  if (state === "late_open") {
    return <Badge variant="orange" dot>Kechikkan ochiq</Badge>;
  }

  return <Badge variant="green" dot>Ochiq</Badge>;
}

export function getHomeworkAcceptingHint(homework: HomeworkAcceptingMeta): string {
  const state = getHomeworkAcceptingState(homework);

  if (state === "closed") {
    return "Topshiriqlar qabul qilinmaydi";
  }

  if (state === "late_open") {
    return "Muddat o'tgan, lekin topshirish ochiq";
  }

  return homework.due_date
    ? `Muddat: ${fmtUzDate(homework.due_date)}`
    : "Muddat belgilanmagan";
}
