import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DepartmentShelf } from "./department-shelf";
import { ProductTile } from "./product-tile";
import type { PublicProduct } from "@/server/services/products";

const PRODUCT: PublicProduct = {
  id: "1",
  name: "Ember Pour-Over Kettle",
  slug: "ember-pour-over-kettle",
  image: "/images/products/ember-pour-over-kettle.svg",
  description: "A kettle.",
  brand: "Hearth",
  category: { id: "c1", name: "Home & Kitchen", slug: "home-kitchen" },
  price: 79.99,
  countInStock: 18,
  rating: 4.5,
  numReviews: 88,
};

describe("ProductTile", () => {
  it("links to the product by slug, not by a missing id", () => {
    render(<ProductTile product={PRODUCT} />);

    // The legacy card read `product.id` where Mongo returned `_id`, so every
    // link was /product/undefined (audit C2).
    expect(screen.getByRole("link")).toHaveAttribute(
      "href",
      "/products/ember-pour-over-kettle",
    );
  });

  it("uses the department's colour", () => {
    render(<ProductTile product={PRODUCT} />);

    expect(screen.getByRole("link")).toHaveClass("bg-mint");
  });

  it("shows the price and no stock warning when in stock", () => {
    render(<ProductTile product={PRODUCT} />);

    expect(screen.getByText("$79.99")).toBeInTheDocument();
    expect(screen.queryByText("Out of stock")).not.toBeInTheDocument();
  });

  it("says when a product is sold out, without striking the price", () => {
    render(<ProductTile product={{ ...PRODUCT, countInStock: 0 }} />);

    const price = screen.getByText("$79.99");
    expect(price).toBeInTheDocument();
    expect(price).not.toHaveClass("line-through");
    expect(screen.getByText("Out of stock")).toBeInTheDocument();
  });

  it("copes with a product whose category was removed", () => {
    render(<ProductTile product={{ ...PRODUCT, category: null }} />);

    expect(screen.getByRole("link")).toHaveClass("bg-sky");
  });
});

describe("DepartmentShelf", () => {
  const renderShelf = (products: PublicProduct[]) =>
    render(
      <DepartmentShelf
        name="Home & Kitchen"
        slug="home-kitchen"
        productCount={products.length}
        products={products}
      />,
    );

  it("gives the drawing and its label one link, so they scroll together", () => {
    renderShelf([PRODUCT]);

    const link = screen.getByRole("link", { name: /Ember Pour-Over Kettle/ });
    expect(link).toHaveTextContent("$79.99");
  });

  it("links the department name to its filtered catalog", () => {
    renderShelf([PRODUCT]);

    expect(screen.getByRole("link", { name: "Home & Kitchen" })).toHaveAttribute(
      "href",
      "/products?category=home-kitchen",
    );
  });

  it("replaces the price of a sold-out product", () => {
    renderShelf([{ ...PRODUCT, countInStock: 0 }]);

    expect(screen.getByText("Out of stock")).toBeInTheDocument();
    expect(screen.queryByText("$79.99")).not.toBeInTheDocument();
  });
});
