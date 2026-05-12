import { redirect } from "next/navigation";

export default function BotAdminsRedirect() {
  redirect("/settings/users");
}
