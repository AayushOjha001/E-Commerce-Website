import type { Metadata } from "next";
import Link from "next/link";

import { requireAdminForPage } from "@/server/auth/session";

export const metadata: Metadata = {
  title: { default: "Admin", template: "%s | Admin" },
  robots: { index: false },
};

const LINKS = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/orders", label: "Orders" },
  { href: "/admin/products", label: "Products" },
  { href: "/admin/categories", label: "Departments" },
];

// proxy.ts turns visitors away before this renders, and a layout can skip
// re-rendering on navigation, so each admin page also checks for itself.
export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  await requireAdminForPage("/admin");

  return (
    <div className="mx-auto w-full max-w-[1400px] flex-1 px-4 pt-4 pb-12 sm:px-6">
      <nav aria-label="Admin" className="bg-ink px-4 py-2 text-paper">
        <ul className="flex flex-wrap gap-x-6 gap-y-1">
          {LINKS.map((link) => (
            <li key={link.href}>
              <Link href={link.href} className="font-medium underline-offset-4 hover:underline">
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <div className="mt-6">{children}</div>
    </div>
  );
}
