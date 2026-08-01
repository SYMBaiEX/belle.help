import { ADMIN_COOKIE } from "@/lib/auth/admin";
import { apiOk } from "@/lib/api/respond";

export async function POST() {
  const res = apiOk({});
  res.cookies.set(ADMIN_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
