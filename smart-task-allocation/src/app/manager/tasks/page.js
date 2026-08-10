import { redirect } from "next/navigation";

export default function ManagerTasksRedirectPage() {
  redirect("/manager/workspace");
}
