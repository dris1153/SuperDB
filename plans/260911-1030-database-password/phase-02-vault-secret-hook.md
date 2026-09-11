---
phase: 2
title: "Shared vault secret hook"
status: pending
priority: P1
effort: "2h"
dependencies: []
---

# Phase 2: Shared vault secret hook

## Overview

Extracts the decrypt-edit-encrypt-save cycle out of `components/connection-credentials.tsx` so the
new password field uses it instead of growing a second copy.

Independent of phase 1. Worth landing alone.

## Why this phase exists

`connection-credentials.tsx` carries a guard that only exists because the obvious version lost data:

A failed decrypt left the password state empty, which is **indistinguishable from having no password
stored**. Saving from there wrote a null blob over the real one, and there is no backup and no undo.
The fix was a `decryptFailed` flag that blocks the save and says why.

Writing that cycle again by hand for the new field would very likely reproduce the defect, because
the broken version is the one that looks correct.

This is the third time in this stretch of work that sharing a state machine beat copying one — see
`useOptimisticOrder` in
[260911-0910 phase 3](../260911-0910-project-drag-ordering/phase-03-shared-order-hook.md). Both
earlier times, review confirmed the copy would have carried the original's defects.

## Requirements

**Functional**
- The connection credentials form behaves **identically** after the extraction. That is the
  acceptance test.
- The hook exposes: the decrypted value, a setter, whether decryption failed, a save, and any error.
- Saving is blocked while decryption has failed.

**Non-functional**
- No behaviour change and no change to the component's props.
- The key never leaves the browser; the hook receives ciphertext and a save function, nothing else.

## Architecture

```ts
export function useVaultSecret<T extends object>(
  blob: string | null,
  save: (blob: string | null) => Promise<void>,
): {
  value: Partial<T>;
  setValue: (next: Partial<T>) => void;
  decryptFailed: boolean;
  saving: boolean;
  error: string | null;
  commit: () => Promise<void>;
};
```

Generic over the blob's shape so both callers fit: `{ supabase_password, email_password }` for the
credentials form, `{ db_password }` for the new field.

What moves in: the `useVault()` key, the decrypt effect with its cancellation flag, the
`decryptFailed` state, and the encrypt-then-save path including the `if (decryptFailed) return`
guard.

What stays out: which fields exist, how they are labelled, and the method-shape logic that decides
whether a Supabase password or a mailbox password applies. That is specific to the credentials form
and does not generalise.

**A null blob means "nothing stored", and an empty encrypted object means the same.** Keep the
existing behaviour where saving with no values writes `null` rather than an encrypted `{}` — but only
when decryption did *not* fail. That distinction is the whole defect.

**Comments travel with the code.** The explanation on the `decryptFailed` guard is the record of a
real data-loss bug. Moving the code without it discards the reason.

## Related Code Files

- Create: `components/use-vault-secret.ts`
- Modify: `components/connection-credentials.tsx` — consume the hook, delete what moved
- Read for context: `components/vault-provider.tsx`, `lib/vault-crypto.ts`, and the
  `useOptimisticOrder` extraction as the pattern to follow

## Implementation Steps

1. Read `connection-credentials.tsx` in full before touching it. The comments carry the reasoning.
2. Write the hook, moving code verbatim where possible rather than rewriting it.
3. Rewire the credentials form; delete what moved.
4. `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`.
5. **Verify the credentials form by hand** — see the criteria. This is the phase's real gate.
6. Diff the hook against the original to confirm the guard survived unchanged.

## Success Criteria

- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm build` clean; `pnpm test` still green.
- [ ] Saving a credential still works; locking, unlocking and reopening returns it.
- [ ] Switching sign-in method still drops the passwords that method does not use.
- [ ] **A blob that cannot be decrypted still blocks saving** — the defect the guard exists for.
- [ ] The `decryptFailed` comment moved with the code.
- [ ] `connection-credentials.tsx` got shorter, not longer.

## Risk Assessment

**Dropping the guard while moving it.** It is a few lines and reads as incidental. It is the entire
reason this phase is not just tidying. Explicit criterion, and the check is a blob the current key
cannot open — not merely a locked vault.

**Over-generalising.** A hook that also owned field definitions would need a config object per caller
and would be worse than two copies. The boundary is deliberate: crypto and save in the hook, fields
in the components.

**Testing the wrong thing.** Green gates prove nothing here — nothing in `lib/**/*.test.ts` touches
this component, and there is no DOM harness. The manual check is the gate, not the suite.

**Generic shape assumptions.** `T extends object` keeps the blob's contents out of the hook. If a
call site needs the hook to know its field names, that is a sign the boundary moved to the wrong
place — change the caller, not the hook.
