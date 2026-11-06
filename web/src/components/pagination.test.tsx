import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Pagination } from "./pagination";

const href = (page: number) => `/products?page=${page}`;

describe("Pagination", () => {
  it("renders nothing for a single page", () => {
    const { container } = render(
      <Pagination page={1} totalPages={1} hrefForPage={href} />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("marks the current page and does not link it", () => {
    render(<Pagination page={2} totalPages={3} hrefForPage={href} />);

    expect(screen.getByText("2")).toHaveAttribute("aria-current", "page");
    expect(screen.queryByRole("link", { name: "2" })).not.toBeInTheDocument();
  });

  it("links the neighbouring pages through the given builder", () => {
    render(<Pagination page={2} totalPages={3} hrefForPage={href} />);

    expect(screen.getByRole("link", { name: "Previous" })).toHaveAttribute(
      "href",
      "/products?page=1",
    );
    expect(screen.getByRole("link", { name: "Next" })).toHaveAttribute(
      "href",
      "/products?page=3",
    );
  });

  it("has no Previous on the first page and no Next on the last", () => {
    const { rerender } = render(
      <Pagination page={1} totalPages={2} hrefForPage={href} />,
    );
    expect(screen.queryByRole("link", { name: "Previous" })).not.toBeInTheDocument();

    rerender(<Pagination page={2} totalPages={2} hrefForPage={href} />);
    expect(screen.queryByRole("link", { name: "Next" })).not.toBeInTheDocument();
  });
});
