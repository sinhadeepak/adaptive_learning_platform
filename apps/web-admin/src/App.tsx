import { RouterProvider, createBrowserRouter } from "react-router-dom";
import { AuthProvider } from "./lib/auth-provider";
import { routes } from "./routes";

const router = createBrowserRouter(routes);

export function App() {
  return (
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  );
}
