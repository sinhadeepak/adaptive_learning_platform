import { Navigate, type RouteObject } from "react-router-dom";
import { AdminGate, GuestOnlyRoute, ProtectedRoute } from "./lib/protected-route";
import { Login } from "./pages/Login";
import { Dashboard } from "./pages/Dashboard";
import { FlagDetail } from "./pages/FlagDetail";
import { Flags } from "./pages/Flags";
import { Audit } from "./pages/Audit";

export const routes: RouteObject[] = [
  { path: "/", element: <Navigate to="/dashboard" replace /> },
  {
    path: "/dashboard",
    element: (
      <ProtectedRoute>
        <AdminGate>
          <Dashboard />
        </AdminGate>
      </ProtectedRoute>
    ),
  },
  {
    path: "/login",
    element: (
      <GuestOnlyRoute>
        <Login />
      </GuestOnlyRoute>
    ),
  },
  {
    path: "/flags",
    element: (
      <ProtectedRoute>
        <AdminGate>
          <Flags />
        </AdminGate>
      </ProtectedRoute>
    ),
  },
  {
    path: "/flags/:name",
    element: (
      <ProtectedRoute>
        <AdminGate>
          <FlagDetail />
        </AdminGate>
      </ProtectedRoute>
    ),
  },
  {
    path: "/audit",
    element: (
      <ProtectedRoute>
        <AdminGate>
          <Audit />
        </AdminGate>
      </ProtectedRoute>
    ),
  },
  { path: "*", element: <Navigate to="/flags" replace /> },
];
