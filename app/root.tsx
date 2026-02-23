import { Links, Meta, Outlet, Scripts, ScrollRestoration, useLoaderData, type LinksFunction } from "react-router";
import { Toaster } from "~/components/ui/toaster";
import stylesheet from "~/app.css?url";

export const links: LinksFunction = () => [
  { rel: "icon", type: "image/svg+xml", href: "https://cdn.rxss.click/rexsystems/logo-transparent.svg" },
  { rel: "preconnect", href: "https://fonts.googleapis.com" },
  { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
  { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" },
  { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap" },
  { rel: "stylesheet", href: stylesheet },
];

export async function loader({ request }: { request: Request }) {
  const { initDatabaseAsync, isFirstRun, queryOne, execute } = await import("~/.server/db");
  await initDatabaseAsync();
  const url = new URL(request.url);
  const path = url.pathname;
  if (path.startsWith("/api/")) return null;
  try {
    if (path !== "/setup" && isFirstRun()) throw new Response(null, { status: 302, headers: { Location: "/setup" } });
    if (path === "/setup" && !isFirstRun()) throw new Response(null, { status: 302, headers: { Location: "/" } });
  } catch (e) { throw e; }
  // Load custom colors + background pattern for dynamic theming
  try {
    if (!isFirstRun()) {
      // Ensure background_pattern column exists
      try { execute("ALTER TABLE system_settings ADD COLUMN background_pattern TEXT NOT NULL DEFAULT 'grid'"); } catch {}
      const sys = queryOne<any>("SELECT primary_color, background_pattern FROM system_settings LIMIT 1");
      if (sys) {
        return {
          primaryColor: sys.primary_color || null,
          backgroundPattern: sys.background_pattern || "grid",
        };
      }
    }
  } catch {}
  return null;
}

export function Layout({ children }: { children: React.ReactNode }) {
  let colorStyle = "";
  try {
    const data = useLoaderData<typeof loader>() as any;
    if (data?.primaryColor) {
      const hex = String(data.primaryColor).replace(/[^#a-fA-F0-9]/g, "").slice(0, 7);
      if (/^#[0-9a-fA-F]{6}$/.test(hex)) {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        const dr = Math.round(r * 0.85), dg = Math.round(g * 0.85), db = Math.round(b * 0.85);
        const hover = `#${dr.toString(16).padStart(2, "0")}${dg.toString(16).padStart(2, "0")}${db.toString(16).padStart(2, "0")}`;
        colorStyle = `:root { --primary: ${hex}; --primary-hover: ${hover}; --primary-r: ${r}; --primary-g: ${g}; --primary-b: ${b}; }`;
      }
    }
  } catch {}

  return (
    <html lang="en" className="dark">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
        {colorStyle && <style dangerouslySetInnerHTML={{ __html: colorStyle }} />}
      </head>
      <body className="antialiased">
        {children}
        <Toaster />
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}
