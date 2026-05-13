// F8a/F8b — thin wrapper that injects X-User-Id (read from the auth
// module's current user) on every call to /api/v1/social. The
// engagement service uses the header as its identity trust boundary,
// consistent with the rest of the analytics surface.

import { auth } from "./api";

function withUserHeader(init: RequestInit | undefined): RequestInit {
  const user = auth.getUser?.();
  const headers = new Headers(init?.headers);
  if (user?.id) headers.set("X-User-Id", user.id);
  return { ...init, headers };
}

export const social = {
  fetch(url: string, init?: RequestInit): Promise<Response> {
    return auth.fetch(url, withUserHeader(init));
  },
};
