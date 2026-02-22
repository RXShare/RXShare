import { destroySessionHeaders } from "~/.server/session";

export async function action() {
  const headers = await destroySessionHeaders();
  return Response.json({ ok: true }, { headers });
}
