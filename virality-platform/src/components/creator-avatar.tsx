"use client";

import { useState, type ReactNode } from "react";

/**
 * A creator's profile picture: the copy saved in the database first (it never expires),
 * then the original link, then `fallback` (e.g. their initial).
 */
export function CreatorAvatar({ id, version, originalSrc, alt = "", className, fallback }: {
  /** Creator key, e.g. "instagram:natgeo" */
  id: string;
  /** Changes when a new picture is saved, so the browser doesn't show an old one. */
  version?: string;
  /** The picture's original link, tried when nothing is saved yet. */
  originalSrc?: string;
  alt?: string;
  className?: string;
  fallback: ReactNode;
}) {
  const sources = [
    `/api/avatar?id=${encodeURIComponent(id.toLowerCase())}${version ? `&v=${encodeURIComponent(version)}` : ""}`,
    ...(originalSrc ? [originalSrc] : []),
  ];
  const [index, setIndex] = useState(0);
  if (index >= sources.length) return <>{fallback}</>;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- saved or remote profile pictures
    <img
      key={sources[index]}
      src={sources[index]}
      alt={alt}
      referrerPolicy="no-referrer"
      className={className}
      onError={() => setIndex((i) => i + 1)}
    />
  );
}
