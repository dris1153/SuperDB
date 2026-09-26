"use client";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

type Props = { open: boolean; onOpenChange: (open: boolean) => void; onConfirm: () => void };

/** The original's warning, word for word: this opens an endpoint anyone can register a client on. */
export function DynamicAppsDialog({ open, onOpenChange, onConfirm }: Props) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Enable dynamic OAuth app registration</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3">
              <p>
                Dynamic OAuth apps (also known as dynamic client registration) exposes a public
                endpoint allowing anyone to register OAuth clients. Bad actors could create malicious
                apps with legitimate-sounding names to phish your users for authorization.
              </p>
              <p>
                You may also see spam registrations that are difficult to trace or moderate, making
                it harder to identify trustworthy applications in your OAuth apps list.
              </p>
              <p>
                Only enable this if you have a specific use case requiring programmatic client
                registration and understand the security implications.
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <Button variant="destructive" onClick={onConfirm}>
            Enable dynamic app registration
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/**
 * "Deactivated", not "deleted", because that is what was measured: a client registered before a
 * disable was listed again after re-enabling.
 */
export function DisableServerDialog({ open, onOpenChange, onConfirm, apps }: Props & { apps: number }) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Disable OAuth Server</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3">
              <p className="text-foreground">
                You have {apps} active OAuth app{apps === 1 ? "" : "s"} that will be deactivated.
              </p>
              <p>
                Disabling the OAuth Server will immediately deactivate all OAuth applications and
                prevent new authentication flows from working. This action will affect all users
                currently using your OAuth applications.
              </p>
              <ul className="list-inside list-disc space-y-1">
                <li>All OAuth apps will be deactivated</li>
                <li>Existing access tokens will become invalid</li>
                <li>Users won&apos;t be able to sign in through OAuth flows</li>
                <li>Third-party integrations will stop working</li>
              </ul>
              <p>You can re-enable the OAuth Server at any time.</p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <Button variant="destructive" onClick={onConfirm}>
            Disable OAuth Server
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
