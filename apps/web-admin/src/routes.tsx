import type { ReactElement } from "react";
import { Navigate, type RouteObject } from "react-router-dom";
import { AdminGate, GuestOnlyRoute, ProtectedRoute } from "./lib/protected-route";
import { Login } from "./pages/Login";
import { Dashboard } from "./pages/Dashboard";
import { FlagDetail } from "./pages/FlagDetail";
import { Flags } from "./pages/Flags";
import { Audit } from "./pages/Audit";
import { Users } from "./pages/Users";
import { Tenants } from "./pages/Tenants";
import { Ops } from "./pages/Ops";

const adminRoute = (path: string, element: ReactElement): RouteObject => ({
  path,
  element: (
    <ProtectedRoute>
      <AdminGate>{element}</AdminGate>
    </ProtectedRoute>
  ),
});

export const routes: RouteObject[] = [
  { path: "/", element: <Navigate to="/dashboard" replace /> },
  adminRoute("/dashboard", <Dashboard />),
  {
    path: "/login",
    element: (
      <GuestOnlyRoute>
        <Login />
      </GuestOnlyRoute>
    ),
  },
  adminRoute("/flags", <Flags />),
  adminRoute("/flags/:name", <FlagDetail />),
  adminRoute("/audit", <Audit />),
  adminRoute("/users", <Users />),
  adminRoute("/tenants", <Tenants />),
  adminRoute("/ops", <Ops />),
  { path: "*", element: <Navigate to="/dashboard" replace /> },
];
