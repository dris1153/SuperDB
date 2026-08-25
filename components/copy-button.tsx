"use client";

import { useState } from "react";
import { IconCheck, IconCopy } from "@tabler/icons-react";
import { Button } from "./ui/button";

export function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          // Clipboard access is denied outside a secure context; the URL is on screen to select.
        }
      }}
    >
      {copied ? <IconCheck size={14} stroke={1.5} className="text-primary" /> : <IconCopy size={14} stroke={1.5} />}
      {copied ? "Copied" : label}
    </Button>
  );
}
