"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { IconPencil } from "@tabler/icons-react";
import { ConnectionCredentials } from "./connection-credentials";
import { TagPicker } from "./tag-picker";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import type { ConnectionSecret } from "@/lib/vault-actions";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./ui/dialog";

export function EditConnection({
  id,
  displayName,
  tags,
  availableTags,
  secret,
  action,
}: {
  id: string;
  displayName: string;
  tags: string[];
  availableTags: string[];
  secret: ConnectionSecret | null;
  action: (id: string, displayName: string, tags: string[]) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(displayName);
  const [selected, setSelected] = useState(tags);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  function save() {
    setError(null);
    start(async () => {
      try {
        await action(id, name, selected);
        setOpen(false);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not save");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="icon-sm" aria-label={`Edit ${displayName}`}>
          <IconPencil size={14} stroke={1.5} />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit connection</DialogTitle>
          <DialogDescription>
            The name is yours — reconnecting or re-authorizing never overwrites it.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="details">
          <TabsList>
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="credentials">Credentials</TabsTrigger>
          </TabsList>

          <TabsContent value="details" className="space-y-4 pt-2">
          <div>
            <label className="mb-1 block text-xs text-subtle" htmlFor={`name-${id}`}>
              Name
            </label>
            <Input
              id={`name-${id}`}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Production"
            />
          </div>

          <div>
            <span className="mb-1 block text-xs text-subtle">Tags</span>
            <TagPicker available={availableTags} value={selected} onChange={setSelected} />
          </div>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          </TabsContent>

          <TabsContent value="credentials" className="pt-2">
            <ConnectionCredentials connectionId={id} secret={secret} />
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={save} disabled={pending || !name.trim()}>
            {pending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
