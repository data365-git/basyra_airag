import { redirect } from "next/navigation";

// Users management has moved to /chatbot/admins
export default function UsersPageRedirect() {
  redirect("/chatbot/admins");
}
