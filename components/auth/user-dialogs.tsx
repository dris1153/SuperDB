"use client";

import { useState } from "react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BAN_DURATIONS, type BanDuration } from "@/lib/auth-users";

/**
 * The sentence every mail-sending control carries.
 *
 * **Not a quota warning, which is what this was going to say.** The plan had it that
 * `rate_limit_email_sent = 2` would refuse the third send in an hour, so the page should count the
 * clicks. Measured 2026-09-26: nine of these went out in a row without a refusal — the admin
 * endpoint does not appear to spend the project's hourly allowance the way a user-initiated send
 * does. So nothing stops a mistake here, which is the thing actually worth saying.
 */
export const MAIL_QUOTA_NOTE =
  "This sends real email to the address, immediately. It cannot be recalled, and nothing here limits how many go out.";

const Reason = ({ error }: { error: string | null }) =>
  error ? <p className="text-sm text-destructive">{error}</p> : null;

/** Create takes a password; invite sends mail and lets the person set their own. */
export function CreateUserDialog({
  open,
  mode: opensAs = "create",
  onOpenChange,
  busy,
  error,
  onCreate,
  onInvite,
}: {
  open: boolean;
  /** Which half the split button asked for. Changeable once open — they are one dialog. */
  mode?: "create" | "invite";
  onOpenChange: (next: boolean) => void;
  busy: boolean;
  error: string | null;
  onCreate: (input: { email: string; password: string; autoConfirm: boolean }) => void;
  onInvite: (email: string) => void;
}) {
  const [mode, setMode] = useState<"create" | "invite">(opensAs);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [autoConfirm, setAutoConfirm] = useState(true);

  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    setEmail("");
    setPassword("");
    setMode(opensAs);
    setAutoConfirm(true);
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "Create a user" : "Invite a user"}</DialogTitle>
          <DialogDescription>
            {mode === "create"
              ? "The user exists immediately and can sign in with this password."
              : MAIL_QUOTA_NOTE}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex gap-2">
            {(["create", "invite"] as const).map((option) => (
              <Button
                key={option}
                type="button"
                size="sm"
                variant={mode === option ? "secondary" : "ghost"}
                onClick={() => setMode(option)}
              >
                {option === "create" ? "Create" : "Invite by email"}
              </Button>
            ))}
          </div>

          <Input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="user@example.com"
            autoComplete="off"
          />

          {mode === "create" ? (
            <>
              <Input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password, at least six characters"
                type="password"
                autoComplete="new-password"
              />

              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <Checkbox
                  checked={autoConfirm}
                  onCheckedChange={(next) => setAutoConfirm(next === true)}
                />
                Auto confirm the email address
              </label>
            </>
          ) : null}

          <Reason error={error} />
        </div>

        <DialogFooter>
          <Button variant="ghost" disabled={busy} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={busy || !email.trim() || (mode === "create" && password.length < 6)}
            onClick={() =>
              mode === "create"
                ? onCreate({ email: email.trim(), password, autoConfirm })
                : onInvite(email.trim())
            }
          >
            {mode === "create" ? "Create user" : "Send invite"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function BanDialog({
  open,
  onOpenChange,
  email,
  busy,
  error,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  email: string | null;
  busy: boolean;
  error: string | null;
  onConfirm: (duration: BanDuration) => void;
}) {
  const [duration, setDuration] = useState<BanDuration>("24h");

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Ban {email ?? "this user"}</DialogTitle>
          <DialogDescription>
            They cannot sign in until it expires. Existing sessions are not ended by this.
          </DialogDescription>
        </DialogHeader>

        <Select value={duration} onValueChange={(next) => setDuration(next as BanDuration)}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {BAN_DURATIONS.map((d) => (
              <SelectItem key={d.value} value={d.value}>
                {d.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Reason error={error} />

        <DialogFooter>
          <Button variant="ghost" disabled={busy} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="destructive" disabled={busy} onClick={() => onConfirm(duration)}>
            Ban user
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Deleting takes the email typed out, the way the destructive paths elsewhere in this app take the
 * project name: the cost is not visible from the button, and this one ends a person's account.
 */
export function DeleteUserConfirm({
  open,
  onOpenChange,
  email,
  busy,
  error,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  email: string | null;
  busy: boolean;
  error: string | null;
  onConfirm: (typed: string) => void;
}) {
  const [typed, setTyped] = useState("");

  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    setTyped("");
  }

  return (
    <AlertDialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <AlertDialogContent onEscapeKeyDown={(e) => busy && e.preventDefault()}>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this user</AlertDialogTitle>
          <AlertDialogDescription>
            This cannot be undone. Type <span className="text-foreground">{email ?? "the address"}</span>{" "}
            to confirm.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <Input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
        <Reason error={error} />

        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <Button
            variant="destructive"
            disabled={busy || typed.trim() !== (email ?? "").trim()}
            onClick={() => onConfirm(typed.trim())}
          >
            Delete user
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
