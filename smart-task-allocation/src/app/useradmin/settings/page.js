import { redirect } from "next/navigation";

export default function UserAdminSettingsRedirectPage() {
  redirect("/useradmin/accounts");
}
