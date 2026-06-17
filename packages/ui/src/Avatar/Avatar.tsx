// Avatar — Aurora primitive.
//
// Spec: docs/02-design/design-system-v2-aurora.md §7.1
//
// Renders an image if `src` is provided and loads; otherwise falls
// back to initials derived from `name`. `status` overlays a small
// online/offline/busy/away dot at the bottom-right.

import React, { forwardRef, useState } from "react";
import { cn } from "../utils/cn";

export type AvatarSize = "xs" | "sm" | "md" | "lg" | "xl" | "2xl";
export type AvatarStatus = "online" | "offline" | "busy" | "away";

export interface AvatarProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Image URL (preferred — initials are the fallback). */
  src?: string;
  /** User's display name; used for initials + alt-text. */
  name?: string;
  size?: AvatarSize;
  status?: AvatarStatus;
  /** Override the rendered alt text on the inner <img>. Defaults to `name`. */
  alt?: string;
}

function initialsFromName(name?: string): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) {
    return (parts[0]?.[0] ?? "?").toUpperCase();
  }
  const first = parts[0]?.[0] ?? "";
  const last = parts[parts.length - 1]?.[0] ?? "";
  return (first + last).toUpperCase();
}

export const Avatar = forwardRef<HTMLSpanElement, AvatarProps>(function Avatar(
  { src, name, size = "md", status, alt, className, ...rest },
  ref,
) {
  const [errored, setErrored] = useState(false);
  const showImage = Boolean(src) && !errored;
  return (
    <span
      ref={ref}
      className={cn("alp-avatar", `alp-avatar--${size}`, className)}
      aria-label={name ? `${name}${status ? `, ${status}` : ""}` : undefined}
      {...rest}
    >
      {showImage ? (
        <img
          src={src}
          alt={alt ?? name ?? ""}
          onError={() => setErrored(true)}
          loading="lazy"
        />
      ) : (
        <span aria-hidden={Boolean(name)}>{initialsFromName(name)}</span>
      )}
      {status ? (
        <span
          className={cn("alp-avatar__status", `alp-avatar__status--${status}`)}
          aria-hidden="true"
        />
      ) : null}
    </span>
  );
});
