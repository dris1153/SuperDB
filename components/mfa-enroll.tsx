"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { IconShieldLock } from "@tabler/icons-react";
import { confirmEnrollment, startEnrollment } from "@/lib/mfa-actions";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

type Scan = { factorId: string; qr: string; secret: string };

export function MfaEnroll() {
  const [scan, setScan] = useState<Scan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();

  function begin() {
    setError(null);
    start(async () => {
      const state = await startEnrollment();
      if (state.step === "scan") setScan({ factorId: state.factorId, qr: state.qr, secret: state.secret });
      else if (state.step === "idle") setError(state.error ?? "Could not start enrollment");
    });
  }

  function confirm() {
    if (!scan) return;
    setError(null);
    start(async () => {
      const result = await confirmEnrollment(scan.factorId, code);
      if (result.ok) router.refresh();
      else setError(result.error);
    });
  }

  if (!scan) {
    return (
      <div className="space-y-2">
        <Button onClick={begin} disabled={pending}>
          <IconShieldLock size={16} stroke={1.5} />
          {pending ? "Starting…" : "Enable two-factor"}
        </Button>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-subtle">
        Scan this with an authenticator app, then enter the six-digit code it shows.
      </p>

      {/* qr_code comes back from Supabase as an SVG data URI. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={scan.qr} alt="Two-factor QR code" className="size-44 rounded-md bg-white p-2" />

      <details>
        <summary className="text-xs text-subtle">Can&apos;t scan? Enter the key manually</summary>
        <code className="mt-1 block font-mono text-xs break-all text-muted-foreground">{scan.secret}</code>
      </details>

      <div className="flex items-end gap-2">
        <div className="w-40">
          <label className="mb-1 block text-xs text-subtle" htmlFor="mfa-code">
            Six-digit code
          </label>
          <Input
            id="mfa-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder="000000"
            className="font-mono"
          />
        </div>
        <Button variant="default" onClick={confirm} disabled={pending || code.length < 6}>
          {pending ? "Verifying…" : "Verify"}
        </Button>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <p className="text-xs text-warn">
        Supabase has no recovery codes. If you lose this authenticator you lose access to this account —
        enroll a second device, or keep the key above somewhere safe.
      </p>
    </div>
  );
}
