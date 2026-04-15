import Link from "next/link";
import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/lib/supabase/server";

interface ProjectRow {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export default async function ProjectsPage() {
  const hasSupabaseEnv =
    !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
    !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!hasSupabaseEnv) {
    return (
      <section className="max-w-5xl mx-auto px-6 pt-16 pb-16">
        <div className="rounded-[12px] border border-[#f4f4f4] bg-white p-6 text-sm text-muted-foreground">
          Missing `NEXT_PUBLIC_SUPABASE_URL` and/or
          `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
          <br />
          Add them to `apps/web/.env.local` and restart dev server.
        </div>
      </section>
    );
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth");
  }

  const { data: projects, error } = await supabase
    .from("projects")
    .select("id,title,created_at,updated_at")
    .order("updated_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (
    <section className="max-w-5xl mx-auto px-6 pt-16 pb-16">
      <div className="flex items-center justify-between gap-3 mb-6">
        <h1 className="text-xl font-semibold">Projects</h1>
        <Link
          href="/projects/new"
          className="rounded-[10px] border border-[#f4f4f4] bg-white px-3 py-1.5 text-xs font-medium text-[#777]"
        >
          New project
        </Link>
      </div>
      {projects && projects.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {(projects as ProjectRow[]).map((project) => (
            <Link
              key={project.id}
              href={`/projects/${project.id}`}
              className="block rounded-[12px] border border-[#f4f4f4] bg-white p-4 hover:shadow-sm transition-shadow"
            >
              <div className="text-sm font-medium">
                {project.title || "New component"}
              </div>
              <div className="mt-2 text-xs text-muted-foreground">
                Updated {new Date(project.updated_at).toLocaleString()}
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="rounded-[12px] border border-[#f4f4f4] bg-white p-6 text-sm text-muted-foreground">
          No projects yet. Generate your first component to create one.
        </div>
      )}
    </section>
  );
}
