# Sorp AI Workspace (json-render based)

Sorp AI is a project-based generative UI workspace built on top of `json-render`.

It helps teams move from prompt-based UI generation to a repeatable design workflow with:

- project-level organization,
- version history (`v1`, `v2`, `v3`...),
- element-level annotations,
- and code export from generated specs.

## Value Proposition

- **From one-off prompts to product workflow**: each generated component lives in a project and keeps its history.
- **Safer AI output**: generation is constrained by `json-render` catalog/registry guardrails.
- **Faster iteration loop**: users can annotate exact UI elements and create the next version.
- **Built for collaboration-ready continuity**: versions are persisted and recoverable after refresh/login.
- **Auth + data isolation by default**: Supabase Auth and RLS keep data scoped per user.

## Current Product Scope

Web app lives under `apps/web` and includes:

- `login` and `signup` flows (email/password + GitHub OAuth),
- `projects` list page with polished empty state,
- `project detail` workspace (`/projects/[projectId]`) with:
  - Design / Code switch,
  - Live Render / Static Code tabs,
  - annotation mode,
  - version selector,
  - export / maximize actions.

## Tech Stack

- **App framework**: Next.js App Router
- **UI generation engine**: `@json-render/core`, `@json-render/react`, `@json-render/codegen`, `@json-render/yaml`
- **AI provider**: Anthropic (`@ai-sdk/anthropic`)
- **Auth + database**: Supabase (`@supabase/supabase-js`, `@supabase/ssr`)
- **Styling**: Tailwind CSS + custom design tokens in `app/globals.css`

## Data Model

Supabase tables:

- `public.projects`
  - `id`, `user_id`, `title`, `created_at`, `updated_at`
- `public.project_versions`
  - `id`, `project_id`, `label`, `spec_json`, `created_at`

Migration:

- `supabase/migrations/20260414120000_create_projects.sql`

Security:

- RLS enabled on both tables
- policies scoped to `auth.uid()`

## Environment Variables

Create `apps/web/.env.local`:

```bash
# Anthropic
ANTHROPIC_API_KEY=...
ANTHROPIC_MODEL=claude-sonnet-4-6

# Supabase
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

## Local Development

From repository root:

```bash
pnpm install
pnpm --filter web dev
```

Primary local URL:

- [http://localhost:4172](http://localhost:4172)

## Quick Start Checklist

1. Add `apps/web/.env.local` values.
2. Run Supabase migration for `projects` and `project_versions`.
3. Confirm Supabase Auth providers (email + GitHub) are configured.
4. Start app and visit `/projects`.

## Key Files

- `apps/web/components/demo.tsx` — core workspace (generation, annotation, versions)
- `apps/web/app/(main)/projects/page.tsx` — projects list + empty state
- `apps/web/app/(main)/projects/[projectId]/page.tsx` — project detail route
- `apps/web/app/api/generate/route.ts` — AI generation endpoint
- `apps/web/middleware.ts` — auth route protection
- `apps/web/lib/supabase/client.ts` — browser client
- `apps/web/lib/supabase/server.ts` — server client

## Monorepo Note

This repository still contains the broader `json-render` packages and examples.  
Sorp AI product work is primarily in `apps/web`.

## License

Apache-2.0
