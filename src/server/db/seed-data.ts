/**
 * Demo catalog for local development.
 *
 * Images are local SVGs under `public/images/products/`, committed with the
 * repo. The legacy frontend pointed at `via.placeholder.com`, which no longer
 * resolves reliably, so the catalog would render broken images.
 */

export type SeedCategory = {
  name: string;
  slug: string;
  description: string;
};

export type SeedProduct = {
  name: string;
  slug: string;
  categorySlug: string;
  brand: string;
  price: number;
  countInStock: number;
  rating: number;
  numReviews: number;
  description: string;
};

export const SEED_CATEGORIES: SeedCategory[] = [
  { name: "Audio", slug: "audio", description: "Headphones, speakers and monitors." },
  { name: "Computers", slug: "computers", description: "Laptops, desktops and peripherals." },
  { name: "Phones", slug: "phones", description: "Smartphones and accessories." },
  {
    name: "Home & Kitchen",
    slug: "home-kitchen",
    description: "Kettles, grinders and everyday kitchen kit.",
  },
  { name: "Wearables", slug: "wearables", description: "Watches and fitness trackers." },
];

export const SEED_PRODUCTS: SeedProduct[] = [
  {
    name: "Aurora Wireless Headphones",
    slug: "aurora-wireless-headphones",
    categorySlug: "audio",
    brand: "Soniq",
    price: 199.99,
    countInStock: 12,
    rating: 4.6,
    numReviews: 128,
    description:
      "Over-ear wireless headphones with adaptive noise cancelling and 30 hours of playback on a single charge.",
  },
  {
    name: "Pulse Bluetooth Speaker",
    slug: "pulse-bluetooth-speaker",
    categorySlug: "audio",
    brand: "Soniq",
    price: 89.5,
    countInStock: 30,
    rating: 4.3,
    numReviews: 74,
    description:
      "Pocket-sized speaker with a surprisingly full low end, IP67 water resistance and a 12-hour battery.",
  },
  {
    name: "Studio Over-Ear Monitors",
    slug: "studio-over-ear-monitors",
    categorySlug: "audio",
    brand: "Vantage",
    price: 149,
    countInStock: 8,
    rating: 4.8,
    numReviews: 41,
    description:
      "Flat-response closed-back monitors for mixing, with a detachable cable and replaceable earpads.",
  },
  {
    name: "Meridian 14 Laptop",
    slug: "meridian-14-laptop",
    categorySlug: "computers",
    brand: "Northwind",
    price: 1299,
    countInStock: 5,
    rating: 4.5,
    numReviews: 96,
    description:
      "A 14-inch ultraportable with 16GB of memory, a 1TB NVMe drive and a colour-accurate display.",
  },
  {
    name: "Meridian Mini Desktop",
    slug: "meridian-mini-desktop",
    categorySlug: "computers",
    brand: "Northwind",
    price: 749.99,
    countInStock: 7,
    rating: 4.2,
    numReviews: 33,
    description:
      "Litre-sized desktop that stays quiet under load. Two M.2 slots and room for 64GB of memory.",
  },
  {
    name: "Glide Mechanical Keyboard",
    slug: "glide-mechanical-keyboard",
    categorySlug: "computers",
    brand: "Keytone",
    price: 119.95,
    countInStock: 25,
    rating: 4.7,
    numReviews: 210,
    description:
      "Hot-swappable 75% mechanical keyboard with tactile switches, a gasket mount and per-key backlighting.",
  },
  {
    name: "Orbit Wireless Mouse",
    slug: "orbit-wireless-mouse",
    categorySlug: "computers",
    brand: "Keytone",
    price: 45.5,
    countInStock: 40,
    rating: 4.1,
    numReviews: 158,
    description:
      "Lightweight wireless mouse with a silent scroll wheel and a battery measured in months, not days.",
  },
  {
    name: "Nimbus 5 Smartphone",
    slug: "nimbus-5-smartphone",
    categorySlug: "phones",
    brand: "Halo",
    price: 899,
    countInStock: 15,
    rating: 4.4,
    numReviews: 302,
    description:
      "A 6.1-inch OLED phone with a genuinely good main camera and all-day battery life.",
  },
  {
    name: "Nimbus 5 Pro Smartphone",
    slug: "nimbus-5-pro-smartphone",
    categorySlug: "phones",
    brand: "Halo",
    price: 1149,
    // Deliberately zero: gives the UI and the checkout stock checks a real
    // out-of-stock product to handle without editing data first.
    countInStock: 0,
    rating: 4.6,
    numReviews: 117,
    description:
      "The larger Nimbus, with a telephoto lens, faster charging and a brighter display.",
  },
  {
    name: "Ember Pour-Over Kettle",
    slug: "ember-pour-over-kettle",
    categorySlug: "home-kitchen",
    brand: "Hearth",
    price: 79.99,
    countInStock: 18,
    rating: 4.5,
    numReviews: 88,
    description:
      "Gooseneck kettle with one-degree temperature control and a hold setting that keeps water at target.",
  },
  {
    name: "Terra Burr Grinder",
    slug: "terra-burr-grinder",
    categorySlug: "home-kitchen",
    brand: "Hearth",
    price: 159.5,
    countInStock: 10,
    rating: 4.4,
    numReviews: 64,
    description:
      "Conical burr grinder with 40 stepped settings, from espresso through to French press.",
  },
  {
    name: "Tempo Fitness Watch",
    slug: "tempo-fitness-watch",
    categorySlug: "wearables",
    brand: "Halo",
    price: 249.99,
    countInStock: 22,
    rating: 4.0,
    numReviews: 149,
    description:
      "GPS watch tracking heart rate, sleep and recovery, with a seven-day battery in smartwatch mode.",
  },
];

/** Where a product's committed placeholder image lives. */
export function seedImagePath(slug: string): string {
  return `/images/products/${slug}.svg`;
}
