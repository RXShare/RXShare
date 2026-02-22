import { redirect } from "react-router";
import { getSession } from "~/.server/session";

export async function loader({ request }: { request: Request }) {
  const session = await getSession(request);
  if (session) return redirect("/dashboard");
  return redirect("/auth/login");
}

export default function Home() {
  return null;
}
