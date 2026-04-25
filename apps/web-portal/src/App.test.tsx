import { render, screen } from "@testing-library/react";
import { App } from "./App";

test("renders portal app title", () => {
  render(<App />);
  expect(screen.getByText("Adaptive Learning Platform — Portal")).toBeInTheDocument();
});
