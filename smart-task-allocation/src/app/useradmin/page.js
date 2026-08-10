import { redirect } from "next/navigation";

export default function UserAdminRedirectPage() {
  redirect("/useradmin/accounts");
}
