import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { createSupabaseServerClient } from "@/lib/supabase/server";

interface ProjectRow {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

const FIGMA_ICONS = [
  "https://www.figma.com/api/mcp/asset/902cf180-7ade-4fa8-a323-7c07afdc13d9", // 2157:43
  "https://www.figma.com/api/mcp/asset/ff9bb4d9-db9f-422a-9222-be2bf64309dd", // 2157:17
  "https://www.figma.com/api/mcp/asset/cd041521-ff96-4f0e-87f6-0f7308918985", // 2157:26
  "https://www.figma.com/api/mcp/asset/820a5517-37d5-40a1-be65-ed06db07557a", // 2157:34
  "https://www.figma.com/api/mcp/asset/a52bdb8e-c081-4856-86e1-2ffbca946347", // 2157:53
  "https://www.figma.com/api/mcp/asset/675d24ab-2626-4ff4-b41d-647f2e4a5abd", // 2157:61
  "https://www.figma.com/api/mcp/asset/e7a0c57c-5554-4fb3-9d50-0069ae2be82e", // 2157:71
  "https://www.figma.com/api/mcp/asset/9939660a-6149-4dc6-b162-5688bfac5212", // 2157:80
] as const;

function hashProjectId(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
}

const DEMO_PROJECT_TITLE = "Demo project";

const DEMO_PROJECT_SPEC = {
  root: "card",
  state: {
    chartData: [
      { label: "Mon", value: 12 },
      { label: "Tue", value: 28 },
      { label: "Wed", value: 19 },
      { label: "Thu", value: 34 },
      { label: "Fri", value: 45 },
      { label: "Sat", value: 38 },
      { label: "Sun", value: 52 },
    ],
  },
  elements: {
    card: {
      type: "Card",
      props: { title: "Team Performance", maxWidth: "sm", centered: true },
      children: ["m1", "chart", "sep", "p1", "p2"],
    },
    m1: {
      type: "Metric",
      props: {
        label: "Weekly Revenue",
        value: "12,400",
        prefix: "$",
        change: "+18%",
        changeType: "positive",
      },
    },
    chart: {
      type: "LineGraph",
      props: { data: { $state: "/chartData" } },
    },
    sep: { type: "Separator", props: {} },
    p1: {
      type: "Progress",
      props: { value: 72, label: "Deals Closed -- 72%" },
    },
    p2: {
      type: "Progress",
      props: { value: 91, label: "Retention -- 91%" },
    },
  },
};

function isProjectsTableMissing(message: string): boolean {
  return (
    message.includes("Could not find the table 'public.projects'") ||
    message.includes('relation "public.projects" does not exist')
  );
}

export default async function ProjectsPage() {
  const hasSupabaseEnv =
    !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
    !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!hasSupabaseEnv) {
    return (
      <section className="max-w-5xl mx-auto px-6 pt-24 pb-16">
        <div
          className="fixed top-4 left-[24px] right-[24px] z-30 flex items-center justify-between gap-3"
          style={{ left: 24, right: 24 }}
        >
          <div className="inline-flex h-[34px] items-center gap-1.5 rounded-[10px] border border-[#f4f4f4] bg-background/90 px-3 py-1.5 text-xs font-medium text-[#777]">
            <svg
              width="16"
              height="16"
              viewBox="0 0 40 40"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
              className="shrink-0"
            >
              <g clipPath="url(#projects-logo-clip-env)">
                <rect
                  x="15.6024"
                  y="15.6002"
                  width="8.79518"
                  height="8.79518"
                  rx="1.93976"
                  fill="#22D3BB"
                  stroke="#22D3BB"
                  strokeWidth="0.120482"
                />
                <path
                  d="M10.9156 0.0605469H15.8317C16.9028 0.0607377 17.7709 0.928819 17.7711 2V8.85547H10.9156C9.84435 8.85528 8.9762 7.98703 8.9762 6.91602V2C8.9762 0.928701 9.84435 0.0605473 10.9156 0.0605469Z"
                  fill="#22D3BB"
                  stroke="#22D3BB"
                  strokeWidth="0.120482"
                />
                <path
                  d="M2 8.9762H8.85547V15.8317C8.85528 16.9027 7.98703 17.7709 6.91602 17.7711H2C0.928819 17.7711 0.0607375 16.9028 0.0605469 15.8317V10.9156C0.0605473 9.84435 0.928701 8.9762 2 8.9762Z"
                  fill="#22D3BB"
                  stroke="#22D3BB"
                  strokeWidth="0.120482"
                />
                <path
                  d="M38.0004 8.9762C39.0715 8.97639 39.9398 9.84447 39.9398 10.9156V15.8317C39.9396 16.9027 39.0714 17.7709 38.0004 17.7711H33.0844C32.0132 17.7711 31.1451 16.9028 31.1449 15.8317V8.9762H38.0004Z"
                  fill="#22D3BB"
                  stroke="#22D3BB"
                  strokeWidth="0.120482"
                />
                <path
                  d="M33.0844 22.1405H38.0004C39.0715 22.1407 39.9398 23.0088 39.9398 24.08V28.996C39.9396 30.067 39.0714 30.9353 38.0004 30.9355H31.1449V24.08C31.1449 23.0087 32.0131 22.1405 33.0844 22.1405Z"
                  fill="#22D3BB"
                  stroke="#22D3BB"
                  strokeWidth="0.120482"
                />
                <path
                  d="M24.1687 31.0605H31.0242V37.916C31.024 38.987 30.1558 39.8553 29.0847 39.8555H24.1687C23.0976 39.8555 22.2295 38.9872 22.2293 37.916V33C22.2293 31.9287 23.0974 31.0605 24.1687 31.0605Z"
                  fill="#22D3BB"
                  stroke="#22D3BB"
                  strokeWidth="0.120482"
                />
                <path
                  d="M15.8317 31.0605C16.9028 31.0607 17.7711 31.9288 17.7711 33V37.916C17.771 38.987 16.9027 39.8553 15.8317 39.8555H10.9157C9.8445 39.8555 8.97642 38.9872 8.97623 37.916V31.0605H15.8317Z"
                  fill="#22D3BB"
                  stroke="#22D3BB"
                  strokeWidth="0.120482"
                />
                <path
                  d="M2 22.1405H6.91602C7.98715 22.1407 8.85547 23.0088 8.85547 24.08V30.9355H2C0.928819 30.9355 0.0607375 30.0671 0.0605469 28.996V24.08C0.0605473 23.0087 0.928701 22.1405 2 22.1405Z"
                  fill="#22D3BB"
                  stroke="#22D3BB"
                  strokeWidth="0.120482"
                />
                <path
                  d="M24.1687 0.0605469H29.0847C30.1559 0.060738 31.0242 0.928819 31.0242 2V8.85547H24.1687C23.0976 8.85547 22.2295 7.98715 22.2293 6.91602V2C22.2293 0.928701 23.0974 0.0605469 24.1687 0.0605469Z"
                  fill="#22D3BB"
                  stroke="#22D3BB"
                  strokeWidth="0.120482"
                />
              </g>
              <defs>
                <clipPath id="projects-logo-clip-env">
                  <rect width="40" height="40" fill="white" />
                </clipPath>
              </defs>
            </svg>
            <span className="mx-1 text-[#ccc]">/</span>
            <span>Projects</span>
          </div>
          <Link href="/projects/new" className="btn-primary">
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M12 5v14" />
              <path d="M5 12h14" />
            </svg>
            New project
          </Link>
        </div>
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

  async function deleteProjectAction(formData: FormData) {
    "use server";

    const projectId = String(formData.get("projectId") || "");
    if (!projectId) return;

    const scopedSupabase = await createSupabaseServerClient();
    const {
      data: { user: scopedUser },
    } = await scopedSupabase.auth.getUser();
    if (!scopedUser) return;

    const { data: ownedProject } = await scopedSupabase
      .from("projects")
      .select("id")
      .eq("id", projectId)
      .eq("user_id", scopedUser.id)
      .single();

    if (!ownedProject?.id) return;

    await scopedSupabase
      .from("project_versions")
      .delete()
      .eq("project_id", projectId);
    await scopedSupabase.from("projects").delete().eq("id", projectId);
    revalidatePath("/projects");
  }

  const { data: projects, error } = await supabase
    .from("projects")
    .select("id,title,created_at,updated_at")
    .order("updated_at", { ascending: false });

  if (error) {
    if (isProjectsTableMissing(error.message)) {
      return (
        <section className="max-w-5xl mx-auto px-6 pt-24 pb-16">
          <div
            className="fixed top-4 left-[24px] right-[24px] z-30 flex items-center justify-between gap-3"
            style={{ left: 24, right: 24 }}
          >
            <div className="inline-flex h-[34px] items-center gap-1.5 rounded-[10px] border border-[#f4f4f4] bg-background/90 px-3 py-1.5 text-xs font-medium text-[#777]">
              <svg
                width="16"
                height="16"
                viewBox="0 0 40 40"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden="true"
                className="shrink-0"
              >
                <g clipPath="url(#projects-logo-clip-missing-table)">
                  <rect
                    x="15.6024"
                    y="15.6002"
                    width="8.79518"
                    height="8.79518"
                    rx="1.93976"
                    fill="#22D3BB"
                    stroke="#22D3BB"
                    strokeWidth="0.120482"
                  />
                  <path
                    d="M10.9156 0.0605469H15.8317C16.9028 0.0607377 17.7709 0.928819 17.7711 2V8.85547H10.9156C9.84435 8.85528 8.9762 7.98703 8.9762 6.91602V2C8.9762 0.928701 9.84435 0.0605473 10.9156 0.0605469Z"
                    fill="#22D3BB"
                    stroke="#22D3BB"
                    strokeWidth="0.120482"
                  />
                  <path
                    d="M2 8.9762H8.85547V15.8317C8.85528 16.9027 7.98703 17.7709 6.91602 17.7711H2C0.928819 17.7711 0.0607375 16.9028 0.0605469 15.8317V10.9156C0.0605473 9.84435 0.928701 8.9762 2 8.9762Z"
                    fill="#22D3BB"
                    stroke="#22D3BB"
                    strokeWidth="0.120482"
                  />
                  <path
                    d="M38.0004 8.9762C39.0715 8.97639 39.9398 9.84447 39.9398 10.9156V15.8317C39.9396 16.9027 39.0714 17.7709 38.0004 17.7711H33.0844C32.0132 17.7711 31.1451 16.9028 31.1449 15.8317V8.9762H38.0004Z"
                    fill="#22D3BB"
                    stroke="#22D3BB"
                    strokeWidth="0.120482"
                  />
                  <path
                    d="M33.0844 22.1405H38.0004C39.0715 22.1407 39.9398 23.0088 39.9398 24.08V28.996C39.9396 30.067 39.0714 30.9353 38.0004 30.9355H31.1449V24.08C31.1449 23.0087 32.0131 22.1405 33.0844 22.1405Z"
                    fill="#22D3BB"
                    stroke="#22D3BB"
                    strokeWidth="0.120482"
                  />
                  <path
                    d="M24.1687 31.0605H31.0242V37.916C31.024 38.987 30.1558 39.8553 29.0847 39.8555H24.1687C23.0976 39.8555 22.2295 38.9872 22.2293 37.916V33C22.2293 31.9287 23.0974 31.0605 24.1687 31.0605Z"
                    fill="#22D3BB"
                    stroke="#22D3BB"
                    strokeWidth="0.120482"
                  />
                  <path
                    d="M15.8317 31.0605C16.9028 31.0607 17.7711 31.9288 17.7711 33V37.916C17.771 38.987 16.9027 39.8553 15.8317 39.8555H10.9157C9.8445 39.8555 8.97642 38.9872 8.97623 37.916V31.0605H15.8317Z"
                    fill="#22D3BB"
                    stroke="#22D3BB"
                    strokeWidth="0.120482"
                  />
                  <path
                    d="M2 22.1405H6.91602C7.98715 22.1407 8.85547 23.0088 8.85547 24.08V30.9355H2C0.928819 30.9355 0.0607375 30.0671 0.0605469 28.996V24.08C0.0605473 23.0087 0.928701 22.1405 2 22.1405Z"
                    fill="#22D3BB"
                    stroke="#22D3BB"
                    strokeWidth="0.120482"
                  />
                  <path
                    d="M24.1687 0.0605469H29.0847C30.1559 0.060738 31.0242 0.928819 31.0242 2V8.85547H24.1687C23.0976 8.85547 22.2295 7.98715 22.2293 6.91602V2C22.2293 0.928701 23.0974 0.0605469 24.1687 0.0605469Z"
                    fill="#22D3BB"
                    stroke="#22D3BB"
                    strokeWidth="0.120482"
                  />
                </g>
                <defs>
                  <clipPath id="projects-logo-clip-missing-table">
                    <rect width="40" height="40" fill="white" />
                  </clipPath>
                </defs>
              </svg>
              <span className="mx-1 text-[#ccc]">/</span>
              <span>Projects</span>
            </div>
            <Link href="/projects/new" className="btn-primary">
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M12 5v14" />
                <path d="M5 12h14" />
              </svg>
              New project
            </Link>
          </div>
          <div className="rounded-[12px] border border-[#f4f4f4] bg-white p-6 text-sm text-muted-foreground">
            Supabase tables are not initialized yet.
            <br />
            Run the migration for `projects` and `project_versions`, then reload
            this page.
          </div>
        </section>
      );
    }
    throw new Error(error.message);
  }

  let projectRows = (projects as ProjectRow[]) ?? [];
  const demoProjects = projectRows.filter(
    (project) => project.title === DEMO_PROJECT_TITLE,
  );
  const hasDemoProject = demoProjects.length > 0;

  if (demoProjects.length > 1) {
    const keepId = demoProjects[0]!.id;
    const duplicateIds = demoProjects
      .slice(1)
      .map((project) => project.id)
      .filter((id) => id !== keepId);

    if (duplicateIds.length > 0) {
      await supabase
        .from("project_versions")
        .delete()
        .in("project_id", duplicateIds);
      await supabase.from("projects").delete().in("id", duplicateIds);

      const { data: dedupedProjects, error: dedupeReloadError } = await supabase
        .from("projects")
        .select("id,title,created_at,updated_at")
        .order("updated_at", { ascending: false });

      if (!dedupeReloadError) {
        projectRows = (dedupedProjects as ProjectRow[]) ?? [];
      }
    }
  }

  if (!hasDemoProject) {
    const { data: demoProject, error: demoProjectError } = await supabase
      .from("projects")
      .insert({ title: DEMO_PROJECT_TITLE })
      .select("id")
      .single();

    if (!demoProjectError && demoProject?.id) {
      const { error: demoVersionError } = await supabase
        .from("project_versions")
        .insert({
          project_id: demoProject.id,
          label: "v1",
          spec_json: DEMO_PROJECT_SPEC,
        });

      if (!demoVersionError) {
        const { data: reloadedProjects, error: reloadError } = await supabase
          .from("projects")
          .select("id,title,created_at,updated_at")
          .order("updated_at", { ascending: false });

        if (!reloadError) {
          projectRows = (reloadedProjects as ProjectRow[]) ?? [];
        }
      }
    }
  }

  return (
    <section className="max-w-5xl mx-auto px-6 pt-24 pb-16">
      <div
        className="fixed top-4 left-[24px] right-[24px] z-30 flex items-center justify-between gap-3"
        style={{ left: 24, right: 24 }}
      >
        <div className="inline-flex h-[34px] items-center gap-1.5 rounded-[10px] border border-[#f4f4f4] bg-background/90 px-3 py-1.5 text-xs font-medium text-[#777]">
          <svg
            width="16"
            height="16"
            viewBox="0 0 40 40"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
            className="shrink-0"
          >
            <g clipPath="url(#projects-logo-clip-main)">
              <rect
                x="15.6024"
                y="15.6002"
                width="8.79518"
                height="8.79518"
                rx="1.93976"
                fill="#22D3BB"
                stroke="#22D3BB"
                strokeWidth="0.120482"
              />
              <path
                d="M10.9156 0.0605469H15.8317C16.9028 0.0607377 17.7709 0.928819 17.7711 2V8.85547H10.9156C9.84435 8.85528 8.9762 7.98703 8.9762 6.91602V2C8.9762 0.928701 9.84435 0.0605473 10.9156 0.0605469Z"
                fill="#22D3BB"
                stroke="#22D3BB"
                strokeWidth="0.120482"
              />
              <path
                d="M2 8.9762H8.85547V15.8317C8.85528 16.9027 7.98703 17.7709 6.91602 17.7711H2C0.928819 17.7711 0.0607375 16.9028 0.0605469 15.8317V10.9156C0.0605473 9.84435 0.928701 8.9762 2 8.9762Z"
                fill="#22D3BB"
                stroke="#22D3BB"
                strokeWidth="0.120482"
              />
              <path
                d="M38.0004 8.9762C39.0715 8.97639 39.9398 9.84447 39.9398 10.9156V15.8317C39.9396 16.9027 39.0714 17.7709 38.0004 17.7711H33.0844C32.0132 17.7711 31.1451 16.9028 31.1449 15.8317V8.9762H38.0004Z"
                fill="#22D3BB"
                stroke="#22D3BB"
                strokeWidth="0.120482"
              />
              <path
                d="M33.0844 22.1405H38.0004C39.0715 22.1407 39.9398 23.0088 39.9398 24.08V28.996C39.9396 30.067 39.0714 30.9353 38.0004 30.9355H31.1449V24.08C31.1449 23.0087 32.0131 22.1405 33.0844 22.1405Z"
                fill="#22D3BB"
                stroke="#22D3BB"
                strokeWidth="0.120482"
              />
              <path
                d="M24.1687 31.0605H31.0242V37.916C31.024 38.987 30.1558 39.8553 29.0847 39.8555H24.1687C23.0976 39.8555 22.2295 38.9872 22.2293 37.916V33C22.2293 31.9287 23.0974 31.0605 24.1687 31.0605Z"
                fill="#22D3BB"
                stroke="#22D3BB"
                strokeWidth="0.120482"
              />
              <path
                d="M15.8317 31.0605C16.9028 31.0607 17.7711 31.9288 17.7711 33V37.916C17.771 38.987 16.9027 39.8553 15.8317 39.8555H10.9157C9.8445 39.8555 8.97642 38.9872 8.97623 37.916V31.0605H15.8317Z"
                fill="#22D3BB"
                stroke="#22D3BB"
                strokeWidth="0.120482"
              />
              <path
                d="M2 22.1405H6.91602C7.98715 22.1407 8.85547 23.0088 8.85547 24.08V30.9355H2C0.928819 30.9355 0.0607375 30.0671 0.0605469 28.996V24.08C0.0605473 23.0087 0.928701 22.1405 2 22.1405Z"
                fill="#22D3BB"
                stroke="#22D3BB"
                strokeWidth="0.120482"
              />
              <path
                d="M24.1687 0.0605469H29.0847C30.1559 0.060738 31.0242 0.928819 31.0242 2V8.85547H24.1687C23.0976 8.85547 22.2295 7.98715 22.2293 6.91602V2C22.2293 0.928701 23.0974 0.0605469 24.1687 0.0605469Z"
                fill="#22D3BB"
                stroke="#22D3BB"
                strokeWidth="0.120482"
              />
            </g>
            <defs>
              <clipPath id="projects-logo-clip-main">
                <rect width="40" height="40" fill="white" />
              </clipPath>
            </defs>
          </svg>
          <span className="mx-1 text-[#ccc]">/</span>
          <span>Projects</span>
        </div>
        <Link href="/projects/new" className="btn-primary">
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M12 5v14" />
            <path d="M5 12h14" />
          </svg>
          New project
        </Link>
      </div>
      <div className="flex min-h-[calc(100vh-220px)] items-center justify-center">
        {projectRows.length > 0 ? (
          <div className="w-full grid grid-cols-1 gap-3">
            {projectRows.map((project) =>
              (() => {
                const seed = hashProjectId(project.id);
                const iconUrl = FIGMA_ICONS[seed % FIGMA_ICONS.length]!;

                return (
                  <div
                    key={project.id}
                    className="relative mx-auto w-[480px] max-w-full rounded-[12px] border border-[#f4f4f4] bg-white p-4 transition-colors hover:border-[#eee]"
                  >
                    <Link
                      href={`/projects/${project.id}`}
                      aria-label={`Open ${project.title || "New component"}`}
                      className="absolute inset-0 z-0 rounded-[12px]"
                    />
                    <div className="relative z-10 flex items-start justify-between gap-3">
                      <div className="min-w-0 flex flex-1 items-start gap-3">
                        <img
                          className="mt-0.5 h-4 w-4 shrink-0 self-start"
                          aria-hidden="true"
                          src={iconUrl}
                          alt=""
                        />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium">
                            {project.title || "New component"}
                          </div>
                          <div className="mt-2 text-xs text-muted-foreground">
                            Updated{" "}
                            {new Date(project.updated_at).toLocaleString()}
                          </div>
                        </div>
                      </div>
                      <details className="relative z-20">
                        <summary className="list-none inline-flex h-7 w-7 items-center justify-center rounded-[8px] text-[#777] transition-colors hover:bg-[#f5f5f5] cursor-pointer">
                          <svg
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden="true"
                          >
                            <circle cx="12" cy="12" r="1" />
                            <circle cx="19" cy="12" r="1" />
                            <circle cx="5" cy="12" r="1" />
                          </svg>
                        </summary>
                        <div className="absolute right-0 top-full mt-1 min-w-[120px] rounded-[10px] border border-[#f4f4f4] bg-white p-1 shadow-[0_6px_18px_rgba(0,0,0,0.08)] z-20">
                          <form action={deleteProjectAction}>
                            <input
                              type="hidden"
                              name="projectId"
                              value={project.id}
                            />
                            <button
                              type="submit"
                              className="w-full inline-flex items-center gap-1.5 rounded-[8px] px-2 py-1.5 text-left text-xs font-medium text-[#b42318] hover:bg-[#fff5f5]"
                            >
                              <svg
                                width="12"
                                height="12"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                aria-hidden="true"
                              >
                                <path d="M3 6h18" />
                                <path d="M8 6V4h8v2" />
                                <rect
                                  x="6"
                                  y="6"
                                  width="12"
                                  height="14"
                                  rx="2"
                                />
                                <path d="M10 10v6" />
                                <path d="M14 10v6" />
                              </svg>
                              Delete
                            </button>
                          </form>
                        </div>
                      </details>
                    </div>
                  </div>
                );
              })(),
            )}
          </div>
        ) : (
          <div className="w-full">
            <div className="flex min-h-[340px] items-center justify-center px-6 py-12">
              <div className="mx-auto flex w-full max-w-[320px] flex-col items-center gap-3 text-center">
                <div className="relative h-10 w-10 text-[#b7b7be]">
                  <svg
                    viewBox="0 0 40 40"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-full w-full"
                    aria-hidden="true"
                  >
                    <path
                      d="M16.7242 16.8419V20.4762C16.5794 20.701 16.4651 20.9371 16.3851 21.1771C16.2746 21.4971 16.2213 21.8286 16.2251 22.1714V24.1714L14.2861 23.0552V18.48L11.3985 16.8152C11.3985 16.8152 11.3718 16.8 11.3603 16.7924C11.0061 16.579 10.8308 16.3314 10.8308 16.0495C10.827 15.7562 11.0137 15.501 11.387 15.2876C11.7642 15.0705 12.2023 14.9638 12.7089 14.9638C13.2156 14.9638 13.627 15.0667 13.9965 15.2686C14.008 15.2762 14.0232 15.2838 14.0346 15.2914L16.7242 16.8419Z"
                      fill="white"
                    />
                    <path
                      d="M39.1886 24.3696C39.1886 24.6515 39.0972 24.9219 38.9105 25.181C38.7277 25.44 38.4572 25.6724 38.1067 25.8781L37.5126 26.221C37.1164 26.4495 36.6364 26.541 36.0726 26.4952C35.5126 26.4495 35.0859 26.2781 34.7964 25.9848C34.5755 25.7829 34.3393 25.5848 34.084 25.4019C33.8288 25.2153 33.5469 25.0324 33.2345 24.8572C33.1888 24.8305 33.1431 24.8038 33.0973 24.781V22.2019C33.0897 21.0362 32.4535 20.0153 31.1926 19.1353C31.0059 19.0058 30.8078 18.88 30.5983 18.7581C28.9373 17.8019 26.9488 17.3219 24.6326 17.3181C24.5412 17.3181 24.4497 17.3181 24.3583 17.3181V15.1543C25.9659 15.1162 27.5392 15.2762 29.0745 15.6305C30.6097 15.981 31.9964 16.5181 33.2345 17.2343C33.4478 17.3562 33.6497 17.4781 33.8364 17.6038C33.9202 17.661 34.004 17.7219 34.084 17.7791C34.3393 17.9619 34.5755 18.16 34.7964 18.3619C34.9069 18.4724 35.0364 18.5677 35.1888 18.6438C35.4288 18.7696 35.7259 18.8458 36.0726 18.8724C36.6364 18.9181 37.1164 18.8267 37.5126 18.5981L38.1067 18.2553C38.4572 18.0496 38.7277 17.8172 38.9105 17.5581C39.0286 17.3981 39.1048 17.2305 39.1505 17.0591L39.1886 24.3658V24.3696Z"
                      fill="white"
                    />
                    <path
                      d="M39.1509 9.3371C39.1471 9.05901 39.0519 8.78853 38.8652 8.52568C38.6747 8.26282 38.4042 8.03044 38.0499 7.82853L28.5222 2.32759C27.7946 1.90473 26.9108 1.69522 25.8746 1.69141C24.8346 1.69141 23.9546 1.90093 23.2308 2.31998L2.11842 14.5066C1.39461 14.9257 1.03272 15.4323 1.03653 16.0304C1.04034 16.6285 1.40603 17.139 2.13746 17.5619L10.2023 22.2171C10.5984 22.4495 11.0784 22.499 11.6422 22.3657C12.2022 22.2323 12.4956 21.9809 12.5146 21.6114C12.5794 21.0628 12.7584 20.5257 13.0518 20C13.3451 19.4704 13.7565 18.9638 14.2861 18.48L11.3985 16.8152C11.3985 16.8152 11.3718 16.8 11.3603 16.7924C11.0061 16.579 10.8308 16.3314 10.8308 16.0495C10.827 15.7562 11.0137 15.501 11.387 15.2876C11.7642 15.0705 12.2023 14.9638 12.7089 14.9638C13.2156 14.9638 13.627 15.0667 13.9965 15.2686C14.008 15.2762 14.0232 15.2838 14.0346 15.2914L16.7242 16.8419C17.2308 16.6019 17.7527 16.3847 18.2937 16.1866C18.8308 15.9923 19.3984 15.8248 19.9927 15.6838L16.6746 13.7676C16.6746 13.7676 16.648 13.7523 16.6365 13.7447C16.2861 13.5314 16.1108 13.2838 16.107 13.0019C16.107 12.7085 16.2936 12.4571 16.667 12.24C17.0403 12.0228 17.4784 11.9162 17.9889 11.9162C18.4765 11.92 18.907 12.019 19.2727 12.2209C19.288 12.2285 19.2994 12.2362 19.3146 12.2438L24.3584 15.1581C25.966 15.12 27.5394 15.28 29.0746 15.6342C30.6099 15.9847 31.9965 16.5219 33.2346 17.2381C33.4479 17.36 33.6499 17.4819 33.8365 17.6076C33.9203 17.6647 34.0042 17.7257 34.0842 17.7828C34.3394 17.9657 34.5756 18.1638 34.7965 18.3657C34.907 18.4762 35.0365 18.5714 35.1889 18.6476C35.4289 18.7733 35.7261 18.8495 36.0727 18.8762C36.6365 18.9219 37.1165 18.8304 37.5127 18.6019L38.1071 18.259C38.4576 18.0533 38.728 17.8209 38.9109 17.5619C39.029 17.4019 39.1052 17.2342 39.1509 17.0628C39.1776 16.9562 39.189 16.8533 39.189 16.7504L39.1509 9.3371ZM35.1775 16.8342L29.9089 13.7905C29.5318 13.5733 29.3451 13.3181 29.3413 13.0247C29.3413 12.7352 29.5279 12.48 29.9013 12.2628L31.2156 11.5009L35.1775 9.2152L35.2194 16.8571L35.1775 16.8342Z"
                      fill="white"
                    />
                    <path
                      d="M35.2194 16.8571L35.1775 16.8342L29.9089 13.7905C29.5318 13.5733 29.3451 13.3181 29.3413 13.0247C29.3413 12.7352 29.5279 12.48 29.9013 12.2628L31.2156 11.5009L35.1775 9.2152L35.2194 16.8571Z"
                      fill="white"
                    />
                    <path
                      d="M24.3584 15.1581L24.3586 17.3219C22.7357 17.341 21.2805 17.6076 19.9929 18.1105L19.9927 15.6838L16.6746 13.7676C16.6746 13.7676 16.648 13.7523 16.6365 13.7447C16.2861 13.5314 16.1108 13.2838 16.107 13.0019C16.107 12.7085 16.2936 12.4571 16.667 12.24C17.0403 12.0228 17.4784 11.9162 17.9889 11.9162C18.4765 11.92 18.907 12.019 19.2727 12.2209C19.288 12.2285 19.2994 12.2362 19.3146 12.2438L24.3584 15.1581Z"
                      fill="white"
                    />
                    <path
                      d="M19.9927 15.6838L19.9929 18.1105C19.5358 18.2895 19.1011 18.499 18.6859 18.739C18.2326 19.0019 17.8402 19.28 17.5126 19.5695C17.185 19.859 16.9223 20.16 16.7242 20.4762V16.8419C17.2308 16.6019 17.7527 16.3847 18.2937 16.1866C18.8308 15.9923 19.3984 15.8248 19.9927 15.6838Z"
                      fill="white"
                    />
                    <path
                      d="M14.2861 18.48L14.286 26.099C13.7565 26.5828 13.3451 27.0894 13.0517 27.619C12.7584 28.1447 12.5794 28.6819 12.5146 29.2304C12.4955 29.6 12.2022 29.8514 11.6422 29.9847C11.0784 30.118 10.5984 30.0685 10.2022 29.8362L2.13744 25.1809C1.40601 24.7581 1.04031 24.2475 1.0365 23.6494L1.03653 16.0304C1.04034 16.6285 1.40603 17.139 2.13746 17.5619L10.2023 22.2171C10.5984 22.4495 11.0784 22.499 11.6422 22.3657C12.2022 22.2323 12.4956 21.9809 12.5146 21.6114C12.5794 21.0628 12.7584 20.5257 13.0518 20C13.3451 19.4704 13.7565 18.9638 14.2861 18.48Z"
                      fill="white"
                    />
                    <path
                      d="M31.1926 19.1353C31.0059 19.0058 30.8078 18.88 30.5983 18.7581C28.9373 17.8019 26.9488 17.3219 24.6326 17.3181C24.5412 17.3181 24.4497 17.3181 24.3583 17.3181C22.7354 17.3371 21.2802 17.6038 19.9926 18.1067C19.5354 18.2857 19.1011 18.4952 18.6859 18.7352C18.2325 18.9981 17.8402 19.2762 17.5125 19.5657C17.1849 19.8552 16.9221 20.1562 16.724 20.4724C16.5792 20.6971 16.4649 20.9333 16.3849 21.1733C16.2744 21.4933 16.2211 21.8248 16.2249 22.1676C16.2249 22.7619 16.3925 23.3181 16.724 23.8362C16.823 23.9962 16.9373 24.1486 17.0668 24.301C17.4744 24.7733 18.0268 25.2076 18.724 25.6114C18.9487 25.741 19.1811 25.8629 19.4249 25.9733C19.8021 26.1524 20.2059 26.3086 20.6287 26.4457C21.3259 26.6705 22.0611 26.8267 22.8344 26.9181V27.2952L22.8497 29.9733C22.8497 30.2552 23.0402 30.5029 23.4173 30.72C23.7906 30.9371 24.2249 31.0476 24.7087 31.0476C25.1925 31.0476 25.623 30.941 25.9963 30.7238C26.3697 30.5105 26.5563 30.2629 26.5563 29.981L26.5411 27.3257V26.9257C27.3107 26.8381 28.0421 26.6819 28.7354 26.461C29.143 26.3314 29.5316 26.179 29.9011 26.0076C30.1563 25.8933 30.4002 25.7676 30.6364 25.6343C31.3221 25.2381 31.863 24.8076 32.2592 24.3429C32.583 23.9733 32.8116 23.5771 32.9487 23.1619C33.0478 22.861 33.0973 22.5448 33.0973 22.2171V22.1981C33.0897 21.0324 32.4535 20.0114 31.1925 19.1314L31.1926 19.1353ZM29.0059 23.2381C28.7811 23.5505 28.4383 23.84 27.9811 24.1029C27.0554 24.6362 25.9544 24.9029 24.6744 24.899C23.3944 24.899 22.2897 24.6286 21.364 24.0914C20.564 23.6305 20.1069 23.0971 19.9926 22.4838C19.9735 22.3848 19.9621 22.2819 19.9621 22.179C19.9621 22.0762 19.9697 21.9657 19.9926 21.8629C20.0688 21.4324 20.3202 21.04 20.7392 20.6857C20.9106 20.541 21.1125 20.4038 21.3411 20.2705C22.1983 19.779 23.204 19.5162 24.3583 19.4819C24.4535 19.4743 24.5487 19.4743 24.644 19.4743C25.924 19.4781 27.0287 19.7448 27.9583 20.2819C28.8878 20.819 29.3563 21.459 29.3602 22.1943C29.364 22.5676 29.2459 22.9143 29.0059 23.2381Z"
                      fill="white"
                    />
                    <path
                      d="M29.3602 22.1943C29.364 22.5676 29.2459 22.9143 29.0059 23.2381C28.7811 23.5505 28.4383 23.84 27.9811 24.1029C27.0554 24.6362 25.9544 24.9029 24.6744 24.899C23.3944 24.899 22.2897 24.6286 21.364 24.0914C20.564 23.6305 20.1069 23.0971 19.9926 22.4838V21.8629C20.0688 21.4324 20.3202 21.04 20.7392 20.6857C20.9106 20.541 21.1125 20.4038 21.3411 20.2705C22.1983 19.779 23.204 19.5162 24.3583 19.4819C24.4535 19.4743 24.5487 19.4743 24.644 19.4743C25.924 19.4781 27.0287 19.7448 27.9583 20.2819C28.8878 20.819 29.3563 21.459 29.3602 22.1943Z"
                      fill="white"
                    />
                    <path
                      d="M22.8346 26.9219V34.541C22.0613 34.4495 21.3261 34.2933 20.6289 34.0685C19.9356 33.8438 19.2994 33.5657 18.7242 33.2342C17.0632 32.2742 16.2289 31.1276 16.2251 29.7905L16.2251 22.1714C16.2251 22.7657 16.3927 23.3219 16.7242 23.84C16.8232 24 16.9375 24.1523 17.067 24.3047C17.4746 24.7771 18.027 25.2114 18.7242 25.6152C18.9489 25.7447 19.1813 25.8666 19.4251 25.9771C19.8023 26.1562 20.2061 26.3123 20.6289 26.4495C21.3261 26.6742 22.0613 26.8305 22.8346 26.9219Z"
                      fill="white"
                    />
                    <path
                      d="M26.5374 34.5485L26.5564 37.6038C26.5564 37.8857 26.3697 38.1333 25.9964 38.3466C25.6231 38.5638 25.1926 38.6705 24.7088 38.6705C24.225 38.6705 23.7907 38.56 23.4174 38.3428C23.0402 38.1257 22.8498 37.8781 22.8498 37.5961L22.8346 34.541L22.8345 27.299L22.8498 29.9771C22.8498 30.259 23.0402 30.5066 23.4174 30.7238C23.7907 30.9409 24.225 31.0514 24.7088 31.0514C25.1926 31.0514 25.6231 30.9447 25.9964 30.7276C26.3697 30.5142 26.5564 30.2666 26.5564 29.9847L26.545 32.2971L26.5374 34.5485Z"
                      fill="white"
                    />
                    <path
                      d="M33.0976 22.2209V29.8209C33.1052 31.158 32.2824 32.3047 30.6367 33.2571C30.0652 33.5847 29.429 33.8628 28.7357 34.0837C28.0424 34.3047 27.3107 34.4609 26.5374 34.5485L26.545 32.2971L26.5564 29.9847L26.5414 27.3294V26.9294C27.3109 26.8418 28.0424 26.6856 28.7357 26.4647C29.1433 26.3352 29.5319 26.1828 29.9014 26.0114C30.1567 25.8971 30.4005 25.7713 30.6367 25.638C31.3224 25.2418 31.8633 24.8114 32.2595 24.3466C32.5833 23.9771 32.8119 23.5809 32.949 23.1656C33.0481 22.8647 33.0976 22.5485 33.0976 22.2209Z"
                      fill="white"
                    />
                    <path
                      d="M16.7242 16.8419V20.4762M16.7242 16.8419L14.0346 15.2914C14.0232 15.2838 14.008 15.2762 13.9965 15.2686C13.627 15.0667 13.2156 14.9638 12.7089 14.9638C12.2023 14.9638 11.7642 15.0705 11.387 15.2876C11.0137 15.501 10.827 15.7562 10.8308 16.0495C10.8308 16.3314 11.0061 16.579 11.3603 16.7924C11.3718 16.8 11.3985 16.8152 11.3985 16.8152L14.2861 18.48M16.7242 16.8419C17.2308 16.6019 17.7527 16.3847 18.2937 16.1866C18.8308 15.9923 19.3984 15.8248 19.9927 15.6838M16.7242 20.4762C16.5794 20.701 16.4651 20.9371 16.3851 21.1771C16.2746 21.4971 16.2213 21.8286 16.2251 22.1714M16.7242 20.4762C16.9223 20.16 17.185 19.859 17.5126 19.5695C17.8402 19.28 18.2326 19.0019 18.6859 18.739C19.1011 18.499 19.5358 18.2895 19.9929 18.1105M16.2251 22.1714V24.1714L14.2861 23.0552V18.48M16.2251 22.1714L16.2251 29.7905C16.2289 31.1276 17.0632 32.2742 18.7242 33.2342C19.2994 33.5657 19.9356 33.8438 20.6289 34.0685C21.3261 34.2933 22.0613 34.4495 22.8346 34.541M16.2251 22.1714C16.2251 22.7657 16.3927 23.3219 16.7242 23.84C16.8232 24 16.9375 24.1523 17.067 24.3047C17.4746 24.7771 18.027 25.2114 18.7242 25.6152C18.9489 25.7447 19.1813 25.8666 19.4251 25.9771C19.8023 26.1562 20.2061 26.3123 20.6289 26.4495C21.3261 26.6742 22.0613 26.8305 22.8346 26.9219V34.541M14.2861 18.48C13.7565 18.9638 13.3451 19.4704 13.0518 20C12.7584 20.5257 12.5794 21.0628 12.5146 21.6114C12.4956 21.9809 12.2022 22.2323 11.6422 22.3657C11.0784 22.499 10.5984 22.4495 10.2023 22.2171L2.13746 17.5619C1.40603 17.139 1.04034 16.6285 1.03653 16.0304M14.2861 18.48L14.286 26.099C13.7565 26.5828 13.3451 27.0894 13.0517 27.619C12.7584 28.1447 12.5794 28.6819 12.5146 29.2304C12.4955 29.6 12.2022 29.8514 11.6422 29.9847C11.0784 30.118 10.5984 30.0685 10.2022 29.8362L2.13744 25.1809C1.40601 24.7581 1.04031 24.2475 1.0365 23.6494L1.03653 16.0304M31.1926 19.1353C32.4535 20.0153 33.0897 21.0362 33.0973 22.2019V24.781C33.1431 24.8038 33.1888 24.8305 33.2345 24.8572C33.5469 25.0324 33.8288 25.2153 34.084 25.4019C34.3393 25.5848 34.5755 25.7829 34.7964 25.9848C35.0859 26.2781 35.5126 26.4495 36.0726 26.4952C36.6364 26.541 37.1164 26.4495 37.5126 26.221L38.1067 25.8781C38.4572 25.6724 38.7277 25.44 38.9105 25.181C39.0972 24.9219 39.1886 24.6515 39.1886 24.3696V24.3658L39.1505 17.0591C39.1048 17.2305 39.0286 17.3981 38.9105 17.5581C38.7277 17.8172 38.4572 18.0496 38.1067 18.2553L37.5126 18.5981C37.1164 18.8267 36.6364 18.9181 36.0726 18.8724C35.7259 18.8458 35.4288 18.7696 35.1888 18.6438C35.0364 18.5677 34.9069 18.4724 34.7964 18.3619C34.5755 18.16 34.3393 17.9619 34.084 17.7791C34.004 17.7219 33.9202 17.661 33.8364 17.6038C33.6497 17.4781 33.4478 17.3562 33.2345 17.2343C31.9964 16.5181 30.6097 15.981 29.0745 15.6305C27.5392 15.2762 25.9659 15.1162 24.3583 15.1543V17.3181M31.1926 19.1353C31.0059 19.0058 30.8078 18.88 30.5983 18.7581C28.9373 17.8019 26.9488 17.3219 24.6326 17.3181C24.5412 17.3181 24.4497 17.3181 24.3583 17.3181M31.1926 19.1353L31.1925 19.1314C32.4535 20.0114 33.0897 21.0324 33.0973 22.1981V22.2171C33.0973 22.5448 33.0478 22.861 32.9487 23.1619C32.8116 23.5771 32.583 23.9733 32.2592 24.3429C31.863 24.8076 31.3221 25.2381 30.6364 25.6343C30.4002 25.7676 30.1563 25.8933 29.9011 26.0076C29.5316 26.179 29.143 26.3314 28.7354 26.461C28.0421 26.6819 27.3107 26.8381 26.5411 26.9257V27.3257L26.5563 29.981C26.5563 30.2629 26.3697 30.5105 25.9963 30.7238C25.623 30.941 25.1925 31.0476 24.7087 31.0476C24.2249 31.0476 23.7906 30.9371 23.4173 30.72C23.0402 30.5029 22.8497 30.2552 22.8497 29.9733L22.8344 27.2952V26.9181C22.0611 26.8267 21.3259 26.6705 20.6287 26.4457C20.2059 26.3086 19.8021 26.1524 19.4249 25.9733C19.1811 25.8629 18.9487 25.741 18.724 25.6114C18.0268 25.2076 17.4744 24.7733 17.0668 24.301C16.9373 24.1486 16.823 23.9962 16.724 23.8362C16.3925 23.3181 16.2249 22.7619 16.2249 22.1676C16.2211 21.8248 16.2744 21.4933 16.3849 21.1733C16.4649 20.9333 16.5792 20.6971 16.724 20.4724C16.9221 20.1562 17.1849 19.8552 17.5125 19.5657C17.8402 19.2762 18.2325 18.9981 18.6859 18.7352C19.1011 18.4952 19.5354 18.2857 19.9926 18.1067C21.2802 17.6038 22.7354 17.3371 24.3583 17.3181M1.03653 16.0304C1.03272 15.4323 1.39461 14.9257 2.11842 14.5066L23.2308 2.31998C23.9546 1.90093 24.8346 1.69141 25.8746 1.69141C26.9108 1.69522 27.7946 1.90473 28.5222 2.32759L38.0499 7.82853C38.4042 8.03044 38.6747 8.26282 38.8652 8.52568C39.0519 8.78853 39.1471 9.05901 39.1509 9.3371L39.189 16.7504C39.189 16.8533 39.1776 16.9562 39.1509 17.0628C39.1052 17.2342 39.029 17.4019 38.9109 17.5619C38.728 17.8209 38.4576 18.0533 38.1071 18.259L37.5127 18.6019C37.1165 18.8304 36.6365 18.9219 36.0727 18.8762C35.7261 18.8495 35.4289 18.7733 35.1889 18.6476C35.0365 18.5714 34.907 18.4762 34.7965 18.3657C34.5756 18.1638 34.3394 17.9657 34.0842 17.7828C34.0042 17.7257 33.9203 17.6647 33.8365 17.6076C33.6499 17.4819 33.4479 17.36 33.2346 17.2381C31.9965 16.5219 30.6099 15.9847 29.0746 15.6342C27.5394 15.28 25.966 15.12 24.3584 15.1581M19.9927 15.6838L16.6746 13.7676C16.6746 13.7676 16.648 13.7523 16.6365 13.7447C16.2861 13.5314 16.1108 13.2838 16.107 13.0019C16.107 12.7085 16.2936 12.4571 16.667 12.24C17.0403 12.0228 17.4784 11.9162 17.9889 11.9162C18.4765 11.92 18.907 12.019 19.2727 12.2209C19.288 12.2285 19.2994 12.2362 19.3146 12.2438L24.3584 15.1581M19.9927 15.6838L19.9929 18.1105M24.3584 15.1581L24.3586 17.3219C22.7357 17.341 21.2805 17.6076 19.9929 18.1105M19.9926 22.4838C20.1069 23.0971 20.564 23.6305 21.364 24.0914C22.2897 24.6286 23.3944 24.899 24.6744 24.899C25.9544 24.9029 27.0554 24.6362 27.9811 24.1029C28.4383 23.84 28.7811 23.5505 29.0059 23.2381C29.2459 22.9143 29.364 22.5676 29.3602 22.1943C29.3563 21.459 28.8878 20.819 27.9583 20.2819C27.0287 19.7448 25.924 19.4781 24.644 19.4743C24.5487 19.4743 24.4535 19.4743 24.3583 19.4819C23.204 19.5162 22.1983 19.779 21.3411 20.2705C21.1125 20.4038 20.9106 20.541 20.7392 20.6857C20.3202 21.04 20.0688 21.4324 19.9926 21.8629M19.9926 22.4838C19.9735 22.3848 19.9621 22.2819 19.9621 22.179C19.9621 22.0762 19.9697 21.9657 19.9926 21.8629M19.9926 22.4838V21.8629M22.8346 34.541L22.8498 37.5962C22.8498 37.8781 23.0402 38.1257 23.4174 38.3428C23.7907 38.56 24.225 38.6705 24.7088 38.6705C25.1926 38.6705 25.6231 38.5638 25.9964 38.3466C26.3697 38.1333 26.5564 37.8857 26.5564 37.6038L26.5374 34.5485M22.8346 34.541L22.8345 27.299L22.8498 29.9771C22.8498 30.259 23.0402 30.5066 23.4174 30.7238C23.7907 30.9409 24.225 31.0514 24.7088 31.0514C25.1926 31.0514 25.6231 30.9447 25.9964 30.7276C26.3697 30.5142 26.5564 30.2666 26.5564 29.9847M26.5374 34.5485L26.545 32.2971L26.5564 29.9847M26.5374 34.5485C27.3107 34.4609 28.0424 34.3047 28.7357 34.0837C29.429 33.8628 30.0652 33.5847 30.6367 33.2571C32.2824 32.3047 33.1052 31.158 33.0976 29.8209V22.2209C33.0976 22.5485 33.0481 22.8647 32.949 23.1656C32.8119 23.5809 32.5833 23.9771 32.2595 24.3466C31.8633 24.8114 31.3224 25.2418 30.6367 25.638C30.4005 25.7713 30.1567 25.8971 29.9014 26.0113C29.5319 26.1828 29.1433 26.3352 28.7357 26.4647C28.0424 26.6856 27.3109 26.8418 26.5414 26.9294V27.3294L26.5564 29.9847M35.1775 16.8342L29.9089 13.7905C29.5318 13.5733 29.3451 13.3181 29.3413 13.0247C29.3413 12.7352 29.5279 12.48 29.9013 12.2628L31.2156 11.5009L35.1775 9.2152L35.2194 16.8571L35.1775 16.8342Z"
                      stroke="#27272A"
                      strokeOpacity="0.25"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
                <div className="flex flex-col items-center gap-2 text-center">
                  <h2 className="text-sm font-medium leading-5 text-[#4e4e55]">
                    No projects yet
                  </h2>
                  <p className="text-xs leading-4 text-[#6f6f77]">
                    Create a new project
                    <br />
                    from the top-right button.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
