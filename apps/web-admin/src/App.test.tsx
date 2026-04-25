import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Login } from "./pages/Login";
import { AuthProvider } from "./lib/auth-provider";

test("admin login renders email + password fields", () => {
  render(
    <MemoryRouter>
      <AuthProvider>
        <Login />
      </AuthProvider>
    </MemoryRouter>,
  );
  expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
  expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /sign in/i })).toBeInTheDocument();
  expect(screen.getByText(/Restricted to institution and platform admins/i)).toBeInTheDocument();
});
