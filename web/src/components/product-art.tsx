import Image from "next/image";

/**
 * A product drawing.
 *
 * `next/image` rather than a bare `<img>` for lazy loading and layout stability.
 * Drawings are SVGs, which the optimiser refuses by design, and `.svg` sources
 * skip it automatically. Admin-entered images may be raster files on any host,
 * so `unoptimized` keeps those working without a remote-host allowlist.
 */
export function ProductArt({
  src,
  alt,
  size,
  sizes,
  eager = false,
  className = "",
}: {
  src: string;
  alt: string;
  size: number;
  sizes?: string;
  /** For the largest image on a page, so it is not lazy-loaded. */
  eager?: boolean;
  className?: string;
}) {
  return (
    <Image
      src={src}
      alt={alt}
      width={size}
      height={size}
      sizes={sizes}
      loading={eager ? "eager" : undefined}
      fetchPriority={eager ? "high" : undefined}
      unoptimized
      className={className}
    />
  );
}
