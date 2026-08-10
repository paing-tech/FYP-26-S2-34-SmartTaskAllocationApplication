import { redirect } from "next/navigation";

export default function UserAdminUsersRedirectPage() {
  redirect("/useradmin/accounts");
}
