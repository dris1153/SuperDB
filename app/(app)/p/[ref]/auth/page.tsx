import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { resolveProject } from "@/lib/inventory";
import { UsersTable } from "@/components/auth/users-table";

export const metadata: Metadata = { title: "Users" };

export const dynamic = "force-dynamic";

/**
 * No container and no subtitle, unlike its siblings under this layout.
 *
 * A grid with eight columns in a 1280px box scrolls sideways while the window has room to spare,
 * and on a page whose whole job is the grid, a line of description costs a row of it. The shape
 * follows `components/table-editor/editor.tsx`, which has owned its own height since it was built.
 */
export default async function AuthUsersPage({ params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params;
  if (!(await resolveProject(ref))) notFound();

  return <UsersTable projectRef={ref} />;
}
