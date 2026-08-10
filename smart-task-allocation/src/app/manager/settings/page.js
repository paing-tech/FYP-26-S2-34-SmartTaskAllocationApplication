import { redirect } from "next/navigation";

export default function ManagerSettingsRedirectPage() {
  redirect("/manager/workspace");
}
