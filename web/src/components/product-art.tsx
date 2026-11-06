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
  priority = false,
  className = "",
}: {
  src: string;
  alt: string;
  size: number;
  sizes?: string;
  priority?: boolean;
  className?: string;
}) {
  return (
    <Image
      src={src}
      alt={alt}
      width={size}
      height={size}
      sizes={sizes}
      priority={priority}
      unoptimized
      className={className}
    />
  );
}
