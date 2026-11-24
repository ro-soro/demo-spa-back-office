import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

// Sanity test นี้ไม่ใช่ feature test — จุดประสงค์คือพิสูจน์ว่า test harness
// (Vitest + React Testing Library + jsdom + jest-dom matcher) ทำงานได้ถูกต้องเท่านั้น
const SANITY_MESSAGE = "Sanity check component rendered";

function SanityCheckComponent(): React.JSX.Element {
  return <p>{SANITY_MESSAGE}</p>;
}

describe("Test harness sanity check", () => {
  it("renders an inline component and finds its text", () => {
    render(<SanityCheckComponent />);

    expect(screen.getByText(SANITY_MESSAGE)).toBeInTheDocument();
  });
});
