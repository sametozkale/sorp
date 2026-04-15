import { Demo } from "@/components/demo";

interface ProjectDetailPageProps {
  params: Promise<{ projectId: string }>;
}

export default async function ProjectDetailPage({
  params,
}: ProjectDetailPageProps) {
  const { projectId } = await params;
  const hasSupabaseEnv =
    !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
    !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  return (
    <section className="max-w-5xl mx-auto px-6 pt-24 pb-16 text-center">
      <div className="w-full text-left max-w-5xl mx-auto">
        {hasSupabaseEnv ? (
          <Demo projectId={projectId} />
        ) : (
          <div className="rounded-[12px] border border-[#f4f4f4] bg-white p-6 text-sm text-muted-foreground">
            Missing `NEXT_PUBLIC_SUPABASE_URL` and/or
            `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
            <br />
            Add them to `apps/web/.env.local` and restart dev server.
          </div>
        )}
      </div>
    </section>
  );
}
