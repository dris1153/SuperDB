"use client";

import { useState } from "react";
import { Tab } from "@/components/tab";
import { BucketTable } from "./bucket-table";
import { StoragePoliciesTab } from "./storage-policies-tab";
import { StorageSettings } from "./storage-settings";

/**
 * The three tabs of the Files page.
 *
 * Three different systems behind one row of tabs: Buckets runs against the project's own Storage
 * API through `lib/project-key.ts`, Settings is the Management API's `/config/storage`, and
 * Policies is SQL against the catalog. Nothing about that is visible from the outside, which is the
 * point.
 */
export function StorageFiles({ projectRef }: { projectRef: string }) {
  const [tab, setTab] = useState<"buckets" | "settings" | "policies">("buckets");

  return (
    <section className="space-y-4">
      <div className="flex gap-4 border-b border-border">
        <Tab active={tab === "buckets"} onClick={() => setTab("buckets")}>
          Buckets
        </Tab>
        <Tab active={tab === "settings"} onClick={() => setTab("settings")}>
          Settings
        </Tab>
        <Tab active={tab === "policies"} onClick={() => setTab("policies")}>
          Policies
        </Tab>
      </div>

      {tab === "settings" ? (
        <StorageSettings projectRef={projectRef} />
      ) : tab === "buckets" ? (
        <BucketTable projectRef={projectRef} />
      ) : (
        <StoragePoliciesTab projectRef={projectRef} />
      )}
    </section>
  );
}
