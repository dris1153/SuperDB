"use client";

import { useState, useTransition } from "react";
import { TagPicker } from "./tag-picker";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

/** Client-side because the tag picker holds state; the token still only ever leaves via the action. */
export function ConnectTokenForm({
  availableTags,
  action,
}: {
  availableTags: string[];
  action: (token: string, tags: string[]) => Promise<void>;
}) {
  const [token, setToken] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [pending, start] = useTransition();

  return (
    <div className="mt-3 space-y-3">
      <div>
        <label className="mb-1 block text-xs text-subtle" htmlFor="pat">
          Access token
        </label>
        <Input
          id="pat"
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="sbp_…"
          autoComplete="off"
          className="font-mono"
        />
      </div>

      <div>
        <span className="mb-1 block text-xs text-subtle">Tags (optional)</span>
        <TagPicker available={availableTags} value={tags} onChange={setTags} />
      </div>

      <Button
        disabled={pending || !token.trim()}
        onClick={() => start(() => action(token.trim(), tags))}
      >
        {pending ? "Connecting…" : "Connect token"}
      </Button>
    </div>
  );
}
