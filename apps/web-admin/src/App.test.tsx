import { render, screen } from "@testing-library/react";
import { App } from "./App";

test("renders admin app title", () => {
  render(<App />);
  expect(screen.getByText("Adaptive Learning Platform — Super Admin")).toBeInTheDocument();
});
