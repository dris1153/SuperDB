"use client";

import { useRef, useState } from "react";
import { IconUpload } from "@tabler/icons-react";
import { recordUploads, signUploadUrl } from "@/lib/object-actions";
import { joinPath } from "@/lib/storage-objects";
import { Button } from "@/components/ui/button";

type Done = { name: string; reason: string }[];

/**
 * Uploading, without the browser ever holding a project key.
 *
 * The server signs one URL per file and the browser `PUT`s to it directly — measured 2026-09-25,
 * that URL accepts an upload with no `authorization` header at all. Two consequences worth naming:
 * the file does not pass through this app's server, so there is no request body limit to hit; and
 * `service_role` stays where it is.
 *
 * **Failures are per file.** A bucket that restricts MIME types rejects one file with a message
 * naming the type, and the rest must still go up. One rejected file failing the whole batch would
 * be this app's decision, not the API's.
 */
export function UploadButton({
  projectRef,
  bucket,
  prefix,
  onUploaded,
}: {
  projectRef: string;
  bucket: string;
  prefix: string;
  onUploaded: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [failures, setFailures] = useState<Done>([]);

  const upload = async (chosen: File[]) => {
    setBusy(true);
    setFailures([]);
    const failed: Done = [];
    let uploaded = 0;

    for (const file of chosen) {
      const path = joinPath(prefix, file.name);
      try {
        const signed = await signUploadUrl(projectRef, bucket, path);
        if (!signed.ok) {
          failed.push({ name: file.name, reason: signed.reason });
          continue;
        }

        const res = await fetch(signed.url, {
          method: "PUT",
          headers: { "content-type": file.type || "application/octet-stream" },
          body: file,
        });

        if (!res.ok) {
          // The API puts the real status in the body: an oversized file or a disallowed type says
          // which rule it broke, and that is worth more than "400".
          const body = await res.text();
          let reason = `Upload failed (${res.status}).`;
          try {
            const parsed = JSON.parse(body) as { message?: string };
            if (parsed.message) reason = parsed.message;
          } catch {
            // Not JSON; the status line above already says something true.
          }
          failed.push({ name: file.name, reason });
        } else {
          uploaded++;
        }
      } catch {
        failed.push({ name: file.name, reason: "Could not reach this project's storage." });
      }
    }

    // One line for the batch. Auditing each signature would drop this project's part cache once per
    // file, and the entry that protects is `metrics`, whose upstream limit is ten requests a minute.
    await recordUploads(projectRef, bucket, uploaded, failed.length).catch(() => {});

    setFailures(failed);
    setBusy(false);
    onUploaded();
  };

  return (
    <div className="ms-auto flex flex-col items-end gap-1">
      <input
        ref={input}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          // Snapshotted before the input is cleared: the FileList is live, and emptying the input
          // empties it too.
          const chosen = Array.from(e.target.files ?? []);
          // Cleared so choosing the same file twice in a row fires a change event the second time.
          e.target.value = "";
          if (chosen.length) void upload(chosen);
        }}
      />

      <Button size="sm" disabled={busy} onClick={() => input.current?.click()}>
        <IconUpload size={13} stroke={1.5} />
        {busy ? "Uploading…" : "Upload files"}
      </Button>

      {failures.length > 0 ? (
        <ul className="max-w-sm space-y-0.5 text-right text-xs text-destructive">
          {failures.map((f) => (
            <li key={f.name}>
              <span className="font-mono">{f.name}</span>: {f.reason}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
