import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import App from "./App";

describe("App shell", () => {
  it("renders the piano practice shell", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: "Piano River" })).toBeInTheDocument();
    expect(screen.getByLabelText("Music viewer")).toBeInTheDocument();
    expect(screen.getByLabelText("Piano keyboard")).toBeInTheDocument();
  });
});
