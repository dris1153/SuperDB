"use client";

import { useTransition } from "react";
import { IconTrash } from "@tabler/icons-react";
import { Button } from "./ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "./ui/alert-dialog";

/**
 * Disconnecting is irreversible and its consequences differ by kind — an OAuth grant is revoked
 * upstream, a stored token is only forgotten here — so the dialog says which, rather than being a
 * generic "are you sure".
 *
 * The action is called directly, not through a nested <form>: Radix closes the dialog on Action
 * click, unmounting any form inside it before submission completes.
 */
export function DisconnectConnection({
  id,
  owner,
  kind,
  action,
}: {
  id: string;
  owner: string;
  kind: "pat" | "oauth";
  action: (id: string, owner: string) => Promise<void>;
}) {
  const [pending, start] = useTransition();

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="destructive" size="icon-sm" aria-label={`Disconnect ${owner}`}>
          <IconTrash size={15} stroke={1.5} />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Disconnect {owner}?</AlertDialogTitle>
          <AlertDialogDescription>
            {kind === "oauth"
              ? "This also revokes the grant inside Supabase, so reconnecting means authorizing the app again."
              : "The stored token is deleted here. It stays valid in Supabase until you revoke it there."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={pending}
            onClick={(e) => {
              e.preventDefault();
              start(() => action(id, owner));
            }}
          >
            {pending ? "Disconnecting…" : "Disconnect"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
