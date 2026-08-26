"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";

/**
 * Server actions cannot call a client toast, so they redirect with a query param and this turns it
 * into one, then strips the param — otherwise a refresh replays the same toast.
 *
 * Form validation errors deliberately do not come through here: those belong next to the field that
 * produced them, not in a corner that disappears.
 */
export function ToastFromParams() {
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    const error = params.get("error");
    const connected = params.get("connected");
    const disconnected = params.get("disconnected");
    if (!error && !connected && !disconnected) return;

    if (error) toast.error(error);
    else if (connected) toast.success(`Connected ${connected}`);
    else if (disconnected) toast.success(`Disconnected ${disconnected}`);

    router.replace(pathname);
  }, [params, pathname, router]);

  return null;
}
