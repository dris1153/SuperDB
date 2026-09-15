import { NextResponse, type NextRequest } from "next/server";
import { isProjectRef } from "@/lib/project-ref";
import { isPart } from "@/lib/project-part-names";
import { readIdentity, readPart } from "@/lib/project-parts";
import { requireUser } from "@/lib/supabase/server";

/**
 * The project dashboards' reads, one handler for all of them.
 *
 * Ten handlers would be ten copies of this authorisation and nine chances to get one of them wrong.
 * The whitelist is `lib/project-part-names.ts` and the readers are `lib/project-parts.ts`, declared
 * against that list so neither can drift from the other. Everything a browser can reach is on that
 * list, and nothing else is.
 *
 * Three answers, and the difference between them matters:
 *
 *   401  no session
 *   404  unknown part, malformed ref, or a project this user owns no connection to
 *   200  `{ ok: true, data }` — or `{ ok: false, reason }` when the upstream *refused*
 *
 * A refusal is a 200 on purpose. The project page prints "Disk: the OAuth grant is missing the …
 * scope" rather than showing an empty card, and a bare 403 here would throw away the only part of
 * that the reader can act on. Transport and authorisation failures stay real statuses.
 *
 * `no-store` on every response: these are per-user and derived from a decrypted access token.
 */
const NO_STORE = { "Cache-Control": "no-store" } as const;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ ref: string; part: string }> },
) {
  try {
    return await read(request, await params);
  } catch {
    // Everything below promises JSON, and a client written against that shape would report an
    // unexpected throw — an expired session mid-request, a database that refused the connections
    // query — as a parse error on an HTML page. `attempt` covers the readers; this covers the rest.
    return NextResponse.json(
      { ok: false, reason: "Could not read this project" },
      { status: 500, headers: NO_STORE },
    );
  }
}

/** Next derives HEAD from GET, and a HEAD of `logs` would run the whole Logflare query for nothing. */
export function HEAD() {
  return new NextResponse(null, { status: 405, headers: NO_STORE });
}

async function read(request: NextRequest, { ref, part }: { ref: string; part: string }) {
  try {
    await requireUser();
  } catch {
    return NextResponse.json({ ok: false, reason: "Not authenticated" }, { status: 401, headers: NO_STORE });
  }

  // Checked before anything is sent anywhere: a ref that is not twenty lowercase letters names no
  // project, and a part that is not in the map names nothing at all.
  if (!isProjectRef(ref)) {
    return NextResponse.json({ ok: false, reason: "Unknown project" }, { status: 404, headers: NO_STORE });
  }

  if (part === "identity") {
    const identity = await readIdentity(ref);
    return identity
      ? NextResponse.json({ ok: true, data: identity }, { headers: NO_STORE })
      : NextResponse.json({ ok: false, reason: "Unknown project" }, { status: 404, headers: NO_STORE });
  }

  // `identity` is handled above and is the one part with no reader, so it cannot reach here.
  if (!isPart(part) || part === "identity") {
    return NextResponse.json({ ok: false, reason: "Unknown part" }, { status: 404, headers: NO_STORE });
  }

  const result = await readPart(part, ref, request.nextUrl.searchParams);
  if (!result) {
    return NextResponse.json({ ok: false, reason: "Unknown project" }, { status: 404, headers: NO_STORE });
  }

  // `attempt` has already turned an upstream failure into a reason; `status` is dropped rather than
  // forwarded, because it describes Supabase's answer to the server, not this response.
  return NextResponse.json(
    result.ok ? { ok: true, data: result.data } : { ok: false, reason: result.reason },
    { headers: NO_STORE },
  );
}
