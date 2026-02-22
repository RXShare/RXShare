import { type RouteConfig, route, index, layout, prefix } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("setup", "routes/setup.tsx"),
  route("auth/login", "routes/auth/login.tsx"),
  route("auth/sign-up", "routes/auth/sign-up.tsx"),
  layout("routes/dashboard/layout.tsx", [
    route("dashboard", "routes/dashboard/index.tsx"),
    route("dashboard/settings", "routes/dashboard/settings.tsx"),
    route("dashboard/admin", "routes/dashboard/admin.tsx"),
  ]),
  route("v/:fileName", "routes/viewer.tsx"),
  route("r/:fileName", "routes/viewer-raw.tsx"),
  route("u/:username", "routes/user-viewer.tsx"),
  route("u/:username/:fileName", "routes/user-viewer.tsx", { id: "user-viewer-file" }),
  // API routes
  route("api/auth/login", "routes/api/auth.login.tsx"),
  route("api/auth/signup", "routes/api/auth.signup.tsx"),
  route("api/auth/logout", "routes/api/auth.logout.tsx"),
  route("api/upload", "routes/api/upload.tsx"),
  route("api/uploads", "routes/api/upload.dashboard.tsx"),
  route("api/uploads/:id", "routes/api/uploads.$id.tsx"),
  route("api/delete/:id", "routes/api/delete.$id.tsx"),
  route("api/tokens", "routes/api/tokens.tsx"),
  route("api/user/settings", "routes/api/user.settings.tsx"),
  route("api/admin/system-settings", "routes/api/admin.system-settings.tsx"),
  route("api/admin/users/:userId", "routes/api/admin.users.$userId.tsx"),
  route("api/system-settings/public", "routes/api/system-settings.public.tsx"),
  route("api/files/*", "routes/api/files.tsx"),
  route("api/thumb/:id", "routes/api/thumb.$id.tsx"),
] satisfies RouteConfig;
