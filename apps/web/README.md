# Sorp AI Web App

Sorp AI is a project-based generative UI workspace built on top of `json-render`.

It lets users:

- generate UI components from prompts,
- keep all iterations as version history (`v1`, `v2`, ...),
- annotate specific rendered elements and create a new version from those notes,
- switch between projects and versions quickly,
- export generated code.

## Product Value

- **Versioned Design Workflow**: every meaningful generation is stored as a version in the project.
- **Project-Centric Organization**: each component journey lives under a project, not a temporary prompt session.
- **Guardrailed AI Output**: generation is constrained by the catalog/registry system.
- **Actionable Annotation Loop**: users can leave targeted feedback on rendered elements and generate the next version.
- **Production-Ready Auth & Data**: Supabase Auth + RLS-backed data model for user-scoped projects.

## Current Architecture

- **Framework**: Next.js App Router (`apps/web`)
- **Auth/Data**: Supabase (`@supabase/supabase-js`, `@supabase/ssr`)
- **UI Generation**: `@json-render/`* stack
- **Core pages**:
  - `/login`
  - `/signup`
  - `/projects`
  - `/projects/[projectId]`

## Data Model (Supabase)

Tables:

- `public.projects`
  - `id`, `user_id`, `title`, `created_at`, `updated_at`
- `public.project_versions`
  - `id`, `project_id`, `label`, `spec_json`, `created_at`

Security:

- RLS enabled on both tables
- policies scoped to `auth.uid()`

Migration file:

- `supabase/migrations/20260414120000_create_projects.sql`

## Local Development

From repo root:

```bash
pnpm install
pnpm --filter web dev
```

This workspace is configured to run web app locally on:

- `http://localhost:4172`

Portless URL may also be available:

- `https://json-render.localhost:1355`

## First-Time Setup Checklist

1. Add `.env.local` values (Anthropic + Supabase).
2. Apply Supabase migration (`projects`, `project_versions` tables).
3. Ensure GitHub/Auth providers are configured in Supabase if OAuth is needed.
4. Start dev server and visit `/projects`.

## Key Implementation Files

- `app/(main)/projects/page.tsx` — projects list
- `app/(main)/projects/[projectId]/page.tsx` — project detail entry
- `components/demo.tsx` — main workspace, generation, annotation, version flow
- `middleware.ts` — route protection and auth redirects
- `lib/supabase/client.ts` — browser Supabase client
- `lib/supabase/server.ts` — server Supabase client

## Notes

- If you see `Could not find the table 'public.projects'`, run the migration and reload.
- If OAuth works in Supabase but not in UI, verify `redirectTo` and allowed redirect URLs in Supabase Auth settings.

