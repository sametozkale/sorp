"use client";

import React, {
  useEffect,
  useState,
  useCallback,
  useRef,
  useMemo,
} from "react";
import { useRouter } from "next/navigation";
import { useUIStream } from "@json-render/react";
import type { Spec } from "@json-render/core";
import { collectUsedComponents, serializeProps } from "@json-render/codegen";
import { toast } from "sonner";
import { CodeBlock } from "./code-block";
import { CopyButton } from "./copy-button";
import { Toaster } from "./ui/sonner";
import { PlaygroundRenderer } from "@/lib/render/renderer";
import { playgroundCatalog } from "@/lib/render/catalog";
import { buildCatalogDisplayData } from "@/lib/render/catalog-display";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const SIMULATION_PROMPT = "Show a team performance dashboard";

interface SimulationStage {
  tree: Spec;
  stream: string;
}

const DASH_STATE = {
  chartData: [
    { label: "Mon", value: 12 },
    { label: "Tue", value: 28 },
    { label: "Wed", value: 19 },
    { label: "Thu", value: 34 },
    { label: "Fri", value: 45 },
    { label: "Sat", value: 38 },
    { label: "Sun", value: 52 },
  ],
};

const METRIC_REVENUE = {
  type: "Metric",
  props: {
    label: "Weekly Revenue",
    value: "12,400",
    prefix: "$",
    change: "+18%",
    changeType: "positive",
  },
} as const;

const CHART = {
  type: "LineGraph",
  props: { data: { $state: "/chartData" } },
} as const;

const SEP = { type: "Separator", props: {} } as const;

const PROGRESS_DEALS = {
  type: "Progress",
  props: { value: 72, label: "Deals Closed -- 72%" },
} as const;

const PROGRESS_RETENTION = {
  type: "Progress",
  props: { value: 91, label: "Retention -- 91%" },
} as const;

const SIMULATION_STAGES: SimulationStage[] = [
  {
    tree: {
      root: "card",
      state: DASH_STATE,
      elements: {
        card: {
          type: "Card",
          props: { title: "Team Performance", maxWidth: "sm", centered: true },
          children: [],
        },
      },
    },
    stream: '{"op":"add","path":"/root","value":"card"}',
  },
  {
    tree: {
      root: "card",
      state: DASH_STATE,
      elements: {
        card: {
          type: "Card",
          props: { title: "Team Performance", maxWidth: "sm", centered: true },
          children: ["m1"],
        },
        m1: METRIC_REVENUE,
      },
    },
    stream:
      '{"op":"add","path":"/elements/m1","value":{"type":"Metric","props":{"label":"Weekly Revenue","value":"12,400","prefix":"$","change":"+18%","changeType":"positive"}}}',
  },
  {
    tree: {
      root: "card",
      state: DASH_STATE,
      elements: {
        card: {
          type: "Card",
          props: { title: "Team Performance", maxWidth: "sm", centered: true },
          children: ["m1", "chart"],
        },
        m1: METRIC_REVENUE,
        chart: CHART,
      },
    },
    stream:
      '{"op":"add","path":"/elements/chart","value":{"type":"LineGraph","props":{"data":{"$state":"/chartData"}}}}',
  },
  {
    tree: {
      root: "card",
      state: DASH_STATE,
      elements: {
        card: {
          type: "Card",
          props: { title: "Team Performance", maxWidth: "sm", centered: true },
          children: ["m1", "chart", "sep", "p1"],
        },
        m1: METRIC_REVENUE,
        chart: CHART,
        sep: SEP,
        p1: PROGRESS_DEALS,
      },
    },
    stream:
      '{"op":"add","path":"/elements/p1","value":{"type":"Progress","props":{"value":72,"label":"Deals Closed -- 72%"}}}',
  },
  {
    tree: {
      root: "card",
      state: DASH_STATE,
      elements: {
        card: {
          type: "Card",
          props: { title: "Team Performance", maxWidth: "sm", centered: true },
          children: ["m1", "chart", "sep", "p1", "p2"],
        },
        m1: METRIC_REVENUE,
        chart: CHART,
        sep: SEP,
        p1: PROGRESS_DEALS,
        p2: PROGRESS_RETENTION,
      },
    },
    stream:
      '{"op":"add","path":"/elements/p2","value":{"type":"Progress","props":{"value":91,"label":"Retention -- 91%"}}}',
  },
];

type Mode = "simulation" | "interactive";
type Phase = "typing" | "streaming" | "complete";
type Tab = "stream" | "json" | "nested" | "catalog";
type RenderView = "dynamic" | "static";
type WorkspaceView = "design" | "code";

interface DemoProps {
  fullscreen?: boolean;
  skipSimulation?: boolean;
  projectId?: string;
}

interface AnnotationItem {
  id: string;
  target: string;
  note: string;
  markerTop: number;
  markerLeft: number;
}

interface AnnotationPanelPos {
  top: number;
  left: number;
}

interface VersionEntry {
  id: string;
  label: string;
  spec: Spec;
  createdAt?: string;
}

interface ProjectEntry {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

function normalizeForComparison(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(normalizeForComparison);
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(
      ([a], [b]) => a.localeCompare(b),
    );
    return Object.fromEntries(
      entries.map(([key, nested]) => [key, normalizeForComparison(nested)]),
    );
  }
  return value;
}

function areSpecsEquivalent(a: Spec, b: Spec): boolean {
  return (
    JSON.stringify(normalizeForComparison(a)) ===
    JSON.stringify(normalizeForComparison(b))
  );
}

function validateAnnotationOnlyChanges(
  baseSpec: Spec,
  nextSpec: Spec,
): { valid: boolean; reason?: string } {
  if (baseSpec.root !== nextSpec.root) {
    return {
      valid: false,
      reason: "Root element cannot change in annotation mode.",
    };
  }

  const baseKeys = Object.keys(baseSpec.elements).sort();
  const nextKeys = Object.keys(nextSpec.elements).sort();
  if (JSON.stringify(baseKeys) !== JSON.stringify(nextKeys)) {
    return {
      valid: false,
      reason: "Annotation mode cannot add or remove elements.",
    };
  }

  if (
    JSON.stringify(normalizeForComparison(baseSpec.state ?? {})) !==
    JSON.stringify(normalizeForComparison(nextSpec.state ?? {}))
  ) {
    return {
      valid: false,
      reason: "Annotation mode cannot modify shared state.",
    };
  }

  let hasPropChange = false;

  for (const key of baseKeys) {
    const baseEl = baseSpec.elements[key];
    const nextEl = nextSpec.elements[key];
    if (!baseEl || !nextEl) continue;

    if (baseEl.type !== nextEl.type) {
      return {
        valid: false,
        reason: "Annotation mode cannot change component types.",
      };
    }

    if (
      JSON.stringify(normalizeForComparison(baseEl.children ?? [])) !==
      JSON.stringify(normalizeForComparison(nextEl.children ?? []))
    ) {
      return {
        valid: false,
        reason: "Annotation mode cannot change component hierarchy.",
      };
    }

    if (
      JSON.stringify(normalizeForComparison(baseEl.visible ?? null)) !==
      JSON.stringify(normalizeForComparison(nextEl.visible ?? null))
    ) {
      return {
        valid: false,
        reason: "Annotation mode cannot change visibility rules.",
      };
    }

    if (
      JSON.stringify(normalizeForComparison(baseEl.on ?? null)) !==
      JSON.stringify(normalizeForComparison(nextEl.on ?? null))
    ) {
      return {
        valid: false,
        reason: "Annotation mode cannot change interactions/actions.",
      };
    }

    if (
      JSON.stringify(normalizeForComparison(baseEl.repeat ?? null)) !==
      JSON.stringify(normalizeForComparison(nextEl.repeat ?? null))
    ) {
      return {
        valid: false,
        reason: "Annotation mode cannot change repeat bindings.",
      };
    }

    if (
      JSON.stringify(normalizeForComparison(baseEl.props ?? {})) !==
      JSON.stringify(normalizeForComparison(nextEl.props ?? {}))
    ) {
      hasPropChange = true;
    }
  }

  if (!hasPropChange) {
    return {
      valid: false,
      reason: "No annotation changes were applied to component props.",
    };
  }

  return { valid: true };
}

function deriveProjectTitleFromSpec(spec: Spec): string | null {
  const root = spec.elements[spec.root];
  if (!root) return null;

  const candidateFields = [
    "title",
    "label",
    "name",
    "text",
    "heading",
  ] as const;
  for (const field of candidateFields) {
    const value = root.props?.[field];
    if (typeof value === "string" && value.trim()) return value.trim();
  }

  for (const childKey of root.children ?? []) {
    const child = spec.elements[childKey];
    if (!child) continue;
    for (const field of candidateFields) {
      const value = child.props?.[field];
      if (typeof value === "string" && value.trim()) return value.trim();
    }
  }

  return null;
}

/**
 * Convert a flat Spec into a nested tree structure that is easier for humans
 * to read. Children keys are resolved recursively into inline objects.
 */
function specToNested(spec: Spec): Record<string, unknown> {
  function resolve(key: string): Record<string, unknown> {
    const el = spec.elements[key];
    if (!el) return { _key: key, _missing: true };

    const node: Record<string, unknown> = { type: el.type };

    if (el.props && Object.keys(el.props).length > 0) {
      node.props = el.props;
    }

    if (el.visible !== undefined) {
      node.visible = el.visible;
    }

    if (el.on && Object.keys(el.on).length > 0) {
      node.on = el.on;
    }

    if (el.repeat) {
      node.repeat = el.repeat;
    }

    if (el.children && el.children.length > 0) {
      node.children = el.children.map(resolve);
    }

    return node;
  }

  const result: Record<string, unknown> = {};

  if (spec.state && Object.keys(spec.state).length > 0) {
    result.state = spec.state;
  }

  result.elements = resolve(spec.root);

  return result;
}

const EXAMPLE_PROMPT_POOL = [
  "Create a metric card showing monthly revenue and change",
  "Generate a profile card component with avatar and role",
  "Build a pricing card component with plan name and CTA",
  "Create a compact notification item component with status",
  "Generate a progress stats card with two indicators",
  "Build a product feature card component with icon and text",
  "Create an order summary card with subtotal and total",
  "Generate a testimonial card component with quote and author",
];

export function Demo({
  fullscreen = false,
  skipSimulation = false,
  projectId,
}: DemoProps) {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [mode, setMode] = useState<Mode>(
    skipSimulation ? "interactive" : "simulation",
  );
  const [phase, setPhase] = useState<Phase>(
    skipSimulation ? "complete" : "typing",
  );
  const [typedPrompt, setTypedPrompt] = useState("");
  const [userPrompt, setUserPrompt] = useState("");
  const [stageIndex, setStageIndex] = useState(-1);
  const [streamLines, setStreamLines] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<Tab>("json");
  const [renderView, setRenderView] = useState<RenderView>("dynamic");
  const [workspaceView, setWorkspaceView] = useState<WorkspaceView>("design");
  const [annotationMode, setAnnotationMode] = useState(false);
  const [annotations, setAnnotations] = useState<AnnotationItem[]>([]);
  const [annotationInput, setAnnotationInput] = useState("");
  const [selectedTarget, setSelectedTarget] = useState<string | null>(null);
  const [annotationPanelPos, setAnnotationPanelPos] =
    useState<AnnotationPanelPos | null>(null);
  const [versions, setVersions] = useState<VersionEntry[]>([]);
  const [activeVersionId, setActiveVersionId] = useState<string | null>(null);
  const [currentProject, setCurrentProject] = useState<ProjectEntry | null>(
    null,
  );
  const [allProjects, setAllProjects] = useState<ProjectEntry[]>([]);
  const [resolvedProjectId, setResolvedProjectId] = useState<string | null>(
    projectId ?? null,
  );
  const [isLoadingProject, setIsLoadingProject] = useState(true);
  const [isPersistingVersion, setIsPersistingVersion] = useState(false);
  const [showProjectMenu, setShowProjectMenu] = useState(false);
  const [showProjectSettingsModal, setShowProjectSettingsModal] =
    useState(false);
  const [projectTitleInput, setProjectTitleInput] = useState("");
  const [isSavingProjectTitle, setIsSavingProjectTitle] = useState(false);
  const [isCreatingVersion, setIsCreatingVersion] = useState(false);
  const [simulationTree, setSimulationTree] = useState<Spec | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [selectedExportFile, setSelectedExportFile] = useState<string | null>(
    null,
  );
  const [showMobileFileTree, setShowMobileFileTree] = useState(false);
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(
    new Set(),
  );
  const inputRef = useRef<HTMLInputElement>(null);
  const annotationInputRef = useRef<HTMLInputElement>(null);
  const renderSurfaceRef = useRef<HTMLDivElement>(null);
  const hoveredElementRef = useRef<HTMLElement | null>(null);
  const selectedElementRef = useRef<HTMLElement | null>(null);
  const latestApiSpecRef = useRef<Spec | null>(null);
  const [catalogSection, setCatalogSection] = useState<
    "components" | "actions"
  >("components");
  const [examplePrompts, setExamplePrompts] = useState(EXAMPLE_PROMPT_POOL);
  const projectMenuRef = useRef<HTMLDivElement>(null);

  // Catalog data for the catalog tab
  const catalogData = useMemo(
    () => buildCatalogDisplayData(playgroundCatalog.data),
    [],
  );

  const loadProjects = useCallback(async () => {
    const { data, error } = await supabase
      .from("projects")
      .select("id,title,created_at,updated_at")
      .order("updated_at", { ascending: false });
    if (error) throw error;
    setAllProjects((data as ProjectEntry[]) ?? []);
  }, [supabase]);

  const loadProjectState = useCallback(
    async (incomingProjectId?: string | null) => {
      const target = incomingProjectId ?? resolvedProjectId;
      setIsLoadingProject(true);

      let effectiveProjectId = target ?? null;
      if (!effectiveProjectId || effectiveProjectId === "new") {
        const { data: created, error: createError } = await supabase
          .from("projects")
          .insert({ title: "New component" })
          .select("id,title,created_at,updated_at")
          .single();
        if (createError || !created)
          throw createError || new Error("Failed to create project.");
        effectiveProjectId = created.id;
        setResolvedProjectId(created.id);
        setCurrentProject(created as ProjectEntry);
        router.replace(`/projects/${created.id}`);
      }

      const { data: project, error: projectError } = await supabase
        .from("projects")
        .select("id,title,created_at,updated_at")
        .eq("id", effectiveProjectId)
        .single();

      if (projectError || !project) {
        router.replace("/projects");
        throw projectError || new Error("Project not found.");
      }

      const { data: versionRows, error: versionError } = await supabase
        .from("project_versions")
        .select("id,label,spec_json,created_at")
        .eq("project_id", effectiveProjectId)
        .order("created_at", { ascending: true });
      if (versionError) throw versionError;

      const mappedVersions: VersionEntry[] = (
        (versionRows as
          | { id: string; label: string; spec_json: Spec; created_at: string }[]
          | null) ?? []
      ).map((row) => ({
        id: row.id,
        label: row.label,
        spec: row.spec_json,
        createdAt: row.created_at,
      }));

      setCurrentProject(project as ProjectEntry);
      setProjectTitleInput((project as ProjectEntry).title || "New component");
      setVersions(mappedVersions);
      setActiveVersionId(
        mappedVersions.length > 0
          ? mappedVersions[mappedVersions.length - 1]!.id
          : null,
      );
      setSimulationTree(
        mappedVersions.length > 0
          ? mappedVersions[mappedVersions.length - 1]!.spec
          : null,
      );
      await loadProjects();
      setIsLoadingProject(false);
    },
    [loadProjects, resolvedProjectId, router, supabase],
  );

  // Disable body scroll when any modal is open
  useEffect(() => {
    if (isFullscreen || showExportModal) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isFullscreen, showExportModal]);

  // Shuffle suggestions after hydration to avoid SSR/CSR mismatch.
  useEffect(() => {
    const prompts = [...EXAMPLE_PROMPT_POOL];
    for (let i = prompts.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [prompts[i], prompts[j]] = [prompts[j]!, prompts[i]!];
    }
    setExamplePrompts(prompts);
  }, []);

  useEffect(() => {
    setResolvedProjectId(projectId ?? null);
  }, [projectId]);

  useEffect(() => {
    void loadProjectState(projectId ?? null).catch((error) => {
      console.error("Project load error:", error);
      setIsLoadingProject(false);
      toast.error(error?.message || "Failed to load project.");
    });
  }, [loadProjectState, projectId]);

  useEffect(() => {
    if (!showProjectMenu) return;
    const onClick = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (projectMenuRef.current?.contains(target)) return;
      setShowProjectMenu(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [showProjectMenu]);

  // Use the library's useUIStream hook for real API calls
  const {
    spec: apiSpec,
    isStreaming,
    send,
    clear,
    rawLines: apiRawLines,
  } = useUIStream({
    api: "/api/generate",
    onError: (err: Error) => {
      console.error("Generation error:", err);
      toast.error(err.message || "Generation failed. Please try again.");
    },
  } as Parameters<typeof useUIStream>[0]);

  const currentSimulationStage =
    stageIndex >= 0 ? SIMULATION_STAGES[stageIndex] : null;

  // Determine which tree to display - keep simulation tree until new API response
  const currentTree =
    mode === "simulation"
      ? currentSimulationStage?.tree || simulationTree
      : apiSpec || simulationTree;
  const showExamplePrompts = !(currentTree && currentTree.root);
  const clearSelectedElement = useCallback(() => {
    if (selectedElementRef.current) {
      selectedElementRef.current.classList.remove("annotation-selected-target");
      selectedElementRef.current = null;
    }
  }, []);

  const clearHoveredElement = useCallback(() => {
    if (hoveredElementRef.current) {
      hoveredElementRef.current.classList.remove("annotation-hover-target");
      hoveredElementRef.current = null;
    }
  }, []);

  const handleRenderSurfaceMouseMove = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (!annotationMode) return;
      const host = renderSurfaceRef.current;
      if (!host) return;

      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (target.closest("[data-annotation-ui='true']")) {
        clearHoveredElement();
        return;
      }

      const picked = target.closest("*") as HTMLElement | null;
      if (
        !picked ||
        !host.contains(picked) ||
        picked === selectedElementRef.current
      ) {
        clearHoveredElement();
        return;
      }

      if (hoveredElementRef.current === picked) return;
      clearHoveredElement();
      picked.classList.add("annotation-hover-target");
      hoveredElementRef.current = picked;
    },
    [annotationMode, clearHoveredElement],
  );

  const handleRenderSurfaceClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (!annotationMode) return;
      const host = renderSurfaceRef.current;
      if (!host) return;
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (target.closest("[data-annotation-ui='true']")) return;

      const picked = target.closest("*") as HTMLElement | null;
      if (!picked || !host.contains(picked)) return;

      clearSelectedElement();
      clearHoveredElement();
      picked.classList.add("annotation-selected-target");
      selectedElementRef.current = picked;

      const text = (picked.textContent || "").trim().slice(0, 40);
      const label = `${picked.tagName.toLowerCase()}${text ? `: "${text}"` : ""}`;
      setSelectedTarget(label);

      const rect = picked.getBoundingClientRect();
      const panelWidth = 320;
      const preferredTop = rect.bottom + 8;
      const preferredLeft = rect.left;
      const maxLeft = Math.max(8, window.innerWidth - panelWidth - 8);
      const safeLeft = Math.min(Math.max(8, preferredLeft), maxLeft);
      const safeTop = Math.min(
        Math.max(8, preferredTop),
        window.innerHeight - 220,
      );
      setAnnotationPanelPos({ top: safeTop, left: safeLeft });

      requestAnimationFrame(() => {
        annotationInputRef.current?.focus();
      });
    },
    [annotationMode, clearHoveredElement, clearSelectedElement],
  );

  const addAnnotation = useCallback(() => {
    if (!selectedTarget || !annotationInput.trim()) return;
    const note = annotationInput.trim();
    const rect = selectedElementRef.current?.getBoundingClientRect();
    const markerTop = Math.max(8, (rect?.top ?? 40) - 10);
    const markerLeft = Math.max(8, (rect?.left ?? 40) - 10);
    setAnnotations((prev) => [
      ...prev,
      {
        id: `${Date.now()}-${prev.length + 1}`,
        target: selectedTarget,
        note,
        markerTop,
        markerLeft,
      },
    ]);
    setAnnotationInput("");
  }, [annotationInput, selectedTarget]);

  const saveAsNextVersion = useCallback(
    async (spec: Spec): Promise<boolean> => {
      if (!resolvedProjectId) return false;

      const existing = versions.find((v) => areSpecsEquivalent(v.spec, spec));
      if (existing) {
        setActiveVersionId(existing.id);
        setSimulationTree(existing.spec);
        return false;
      }

      setIsPersistingVersion(true);
      const nextIndex = versions.length + 1;
      const label = `v${nextIndex}`;
      const { data: inserted, error } = await supabase
        .from("project_versions")
        .insert({
          project_id: resolvedProjectId,
          label,
          spec_json: JSON.parse(JSON.stringify(spec)),
        })
        .select("id,label,spec_json,created_at")
        .single();

      if (error || !inserted) {
        setIsPersistingVersion(false);
        toast.error(error?.message || "Failed to save the new version.");
        return false;
      }

      const entry: VersionEntry = {
        id: inserted.id,
        label: inserted.label,
        spec: inserted.spec_json as Spec,
        createdAt: inserted.created_at,
      };
      const nextVersions = [...versions, entry];
      setVersions(nextVersions);
      setActiveVersionId(entry.id);
      setSimulationTree(entry.spec);

      const isDefaultTitle =
        !currentProject?.title || currentProject.title === "New component";
      if (isDefaultTitle) {
        const derived = deriveProjectTitleFromSpec(entry.spec);
        if (derived) {
          const { data: updatedProject } = await supabase
            .from("projects")
            .update({ title: derived })
            .eq("id", resolvedProjectId)
            .select("id,title,created_at,updated_at")
            .single();
          if (updatedProject) {
            setCurrentProject(updatedProject as ProjectEntry);
            setProjectTitleInput((updatedProject as ProjectEntry).title);
          }
        } else {
          await supabase
            .from("projects")
            .update({ updated_at: new Date().toISOString() })
            .eq("id", resolvedProjectId)
            .select("id,title,created_at,updated_at")
            .single()
            .then(({ data }) => {
              if (data) setCurrentProject(data as ProjectEntry);
            });
        }
      } else {
        await supabase
          .from("projects")
          .update({ updated_at: new Date().toISOString() })
          .eq("id", resolvedProjectId)
          .select("id,title,created_at,updated_at")
          .single()
          .then(({ data }) => {
            if (data) setCurrentProject(data as ProjectEntry);
          });
      }

      await loadProjects();
      setIsPersistingVersion(false);
      return true;
    },
    [
      currentProject?.title,
      loadProjects,
      resolvedProjectId,
      supabase,
      versions,
    ],
  );

  const saveProjectTitle = useCallback(async () => {
    if (!resolvedProjectId) return;
    const title = projectTitleInput.trim();
    if (!title) return;
    setIsSavingProjectTitle(true);
    const { data, error } = await supabase
      .from("projects")
      .update({ title })
      .eq("id", resolvedProjectId)
      .select("id,title,created_at,updated_at")
      .single();
    setIsSavingProjectTitle(false);
    if (error || !data) {
      toast.error(error?.message || "Failed to save project settings.");
      return;
    }
    setCurrentProject(data as ProjectEntry);
    await loadProjects();
    toast.success("Project settings updated");
  }, [loadProjects, projectTitleInput, resolvedProjectId, supabase]);

  const requestChangedSpec = useCallback(
    async (prompt: string, baseSpec?: Spec): Promise<Spec | null> => {
      await send(prompt, baseSpec ? { previousSpec: baseSpec } : undefined);
      let produced = latestApiSpecRef.current;
      if (!produced?.root) return null;

      if (!baseSpec?.root || !areSpecsEquivalent(produced, baseSpec)) {
        return produced;
      }

      const forceChangePrompt = [
        prompt,
        "",
        "IMPORTANT: Your output must include at least one concrete visual/style change versus previousSpec.",
        "Do not return the same spec.",
      ].join("\n");
      await send(forceChangePrompt, { previousSpec: baseSpec });
      produced = latestApiSpecRef.current;
      if (!produced?.root) return null;
      return produced;
    },
    [send],
  );

  const createVersionFromAnnotations = useCallback(async () => {
    if (
      !currentTree?.root ||
      annotations.length === 0 ||
      isCreatingVersion ||
      isPersistingVersion
    )
      return;
    const instructions = annotations
      .map((a, index) => `${index + 1}. Target ${a.target}: ${a.note}`)
      .join("\n");
    const prompt = [
      "Apply these visual annotations to the current UI.",
      "STRICT RULES:",
      "- Change ONLY what is explicitly requested in annotations.",
      "- Do NOT add, remove, or reorder elements.",
      "- Do NOT change component types, state, bindings, events, or visibility logic.",
      "- Only update props on existing elements that are directly related to the requested edits.",
      "",
      instructions,
    ].join("\n");
    setIsCreatingVersion(true);
    try {
      const produced = await requestChangedSpec(prompt, currentTree);
      if (!produced?.root) {
        toast.error("Could not create a new version. Please try again.");
        return;
      }
      if (areSpecsEquivalent(produced, currentTree)) {
        toast.error("No changes were applied. Try a more specific annotation.");
        return;
      }
      const annotationValidation = validateAnnotationOnlyChanges(
        currentTree,
        produced,
      );
      if (!annotationValidation.valid) {
        toast.error(
          annotationValidation.reason ||
            "Annotation update changed more than requested.",
        );
        return;
      }
      if (produced?.root) {
        const saved = await saveAsNextVersion(produced);
        if (saved) {
          setAnnotations([]);
          setAnnotationInput("");
          setSelectedTarget(null);
          setAnnotationPanelPos(null);
          setAnnotationMode(false);
          clearSelectedElement();
          clearHoveredElement();
          toast.success("New version created");
        }
      }
    } finally {
      setIsCreatingVersion(false);
    }
  }, [
    annotations,
    clearHoveredElement,
    clearSelectedElement,
    currentTree,
    isCreatingVersion,
    isPersistingVersion,
    requestChangedSpec,
    saveAsNextVersion,
  ]);

  useEffect(() => {
    if (!annotationMode) {
      clearHoveredElement();
      clearSelectedElement();
      setSelectedTarget(null);
      setAnnotationInput("");
      setAnnotationPanelPos(null);
    }
  }, [annotationMode, clearHoveredElement, clearSelectedElement]);

  useEffect(() => {
    latestApiSpecRef.current = apiSpec;
  }, [apiSpec]);

  const stopGeneration = useCallback(() => {
    if (mode === "simulation") {
      setMode("interactive");
      setPhase("complete");
      setTypedPrompt(SIMULATION_PROMPT);
      setUserPrompt("");
    }
    clear();
  }, [mode, clear]);

  // Typing effect for simulation
  useEffect(() => {
    if (mode !== "simulation" || phase !== "typing") return;

    let i = 0;
    const interval = setInterval(() => {
      if (i < SIMULATION_PROMPT.length) {
        setTypedPrompt(SIMULATION_PROMPT.slice(0, i + 1));
        i++;
      } else {
        clearInterval(interval);
        setTimeout(() => setPhase("streaming"), 500);
      }
    }, 20);

    return () => clearInterval(interval);
  }, [mode, phase]);

  // Streaming effect for simulation
  useEffect(() => {
    if (mode !== "simulation" || phase !== "streaming") return;

    let i = 0;
    const interval = setInterval(() => {
      if (i < SIMULATION_STAGES.length) {
        const stage = SIMULATION_STAGES[i];
        if (stage) {
          setStageIndex(i);
          setStreamLines((prev) => [...prev, stage.stream]);
          setSimulationTree(stage.tree);
        }
        i++;
      } else {
        clearInterval(interval);
        setTimeout(() => {
          setPhase("complete");
          setMode("interactive");
          setUserPrompt("");
        }, 500);
      }
    }, 600);

    return () => clearInterval(interval);
  }, [mode, phase]);

  // Track stream lines from real API (use raw JSONL patch lines)
  useEffect(() => {
    if (mode === "interactive" && apiRawLines.length > 0) {
      setStreamLines(apiRawLines);
    }
  }, [mode, apiRawLines]);

  const handleSubmit = useCallback(async () => {
    if (!userPrompt.trim() || isStreaming || isPersistingVersion) return;
    setStreamLines([]);
    const produced = await requestChangedSpec(
      userPrompt,
      currentTree ?? undefined,
    );
    if (!produced?.root) {
      toast.error("Could not generate a new version. Please try again.");
      return;
    }
    if (currentTree?.root && areSpecsEquivalent(produced, currentTree)) {
      toast.error(
        "No changes detected. Please provide a more specific prompt.",
      );
      return;
    }
    if (produced?.root) {
      await saveAsNextVersion(produced);
    }
  }, [
    userPrompt,
    isStreaming,
    isPersistingVersion,
    requestChangedSpec,
    currentTree,
    saveAsNextVersion,
  ]);

  const jsonCode = currentTree
    ? JSON.stringify(currentTree, null, 2)
    : "// waiting...";

  const nestedCode = useMemo(() => {
    if (!currentTree || !currentTree.root) return "// waiting...";
    return JSON.stringify(specToNested(currentTree), null, 2);
  }, [currentTree]);

  // Generate all export files for Next.js project
  const exportedFiles = useMemo(() => {
    if (!currentTree || !currentTree.root) {
      return [];
    }

    const tree = currentTree;
    const components = collectUsedComponents(tree);
    const files: { path: string; content: string }[] = [];

    // Helper to generate JSX
    function generateJSX(key: string, indent: number): string {
      const element = tree.elements[key];
      if (!element) return "";

      const spaces = "  ".repeat(indent);
      const componentName = element.type;

      const propsObj: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(element.props)) {
        if (v !== null && v !== undefined) {
          propsObj[k] = v;
        }
      }

      const propsStr = serializeProps(propsObj);
      const hasChildren = element.children && element.children.length > 0;

      if (!hasChildren) {
        return propsStr
          ? `${spaces}<${componentName} ${propsStr} />`
          : `${spaces}<${componentName} />`;
      }

      const lines: string[] = [];
      lines.push(
        propsStr
          ? `${spaces}<${componentName} ${propsStr}>`
          : `${spaces}<${componentName}>`,
      );

      for (const childKey of element.children!) {
        lines.push(generateJSX(childKey, indent + 1));
      }

      lines.push(`${spaces}</${componentName}>`);
      return lines.join("\n");
    }

    // 1. package.json
    files.push({
      path: "package.json",
      content: JSON.stringify(
        {
          name: "generated-app",
          version: "0.1.0",
          private: true,
          scripts: {
            dev: "next dev",
            build: "next build",
            start: "next start",
          },
          dependencies: {
            next: "^16.1.3",
            react: "^19.2.3",
            "react-dom": "^19.2.3",
          },
          devDependencies: {
            "@types/node": "^25.0.9",
            "@types/react": "^19.2.8",
            typescript: "^5.9.3",
          },
        },
        null,
        2,
      ),
    });

    // 2. tsconfig.json
    files.push({
      path: "tsconfig.json",
      content: JSON.stringify(
        {
          compilerOptions: {
            target: "ES2017",
            lib: ["dom", "dom.iterable", "esnext"],
            allowJs: true,
            skipLibCheck: true,
            strict: true,
            noEmit: true,
            esModuleInterop: true,
            module: "esnext",
            moduleResolution: "bundler",
            resolveJsonModule: true,
            isolatedModules: true,
            jsx: "preserve",
            incremental: true,
            plugins: [{ name: "next" }],
            paths: { "@/*": ["./*"] },
          },
          include: ["next-env.d.ts", "**/*.ts", "**/*.tsx"],
          exclude: ["node_modules"],
        },
        null,
        2,
      ),
    });

    // 3. next.config.js
    files.push({
      path: "next.config.js",
      content: `/** @type {import('next').NextConfig} */
module.exports = {
  reactStrictMode: true,
};
`,
    });

    // 4. app/globals.css
    files.push({
      path: "app/globals.css",
      content: `@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --background: #ffffff;
  --foreground: #171717;
  --border: #e5e5e5;
  --muted-foreground: #737373;
}

@media (prefers-color-scheme: dark) {
  :root {
    --background: #0a0a0a;
    --foreground: #ededed;
    --border: #262626;
    --muted-foreground: #a3a3a3;
  }
}

body {
  background: var(--background);
  color: var(--foreground);
  font-family: system-ui, sans-serif;
}
`,
    });

    // 5. tailwind.config.js
    files.push({
      path: "tailwind.config.js",
      content: `/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        border: "var(--border)",
        "muted-foreground": "var(--muted-foreground)",
      },
    },
  },
  plugins: [],
};
`,
    });

    // 6. app/layout.tsx
    files.push({
      path: "app/layout.tsx",
      content: `import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Generated App",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
`,
    });

    // 7. Component files
    const componentTemplates: Record<string, string> = {
      Card: `"use client";

import { ReactNode } from "react";

interface CardProps {
  title?: string;
  description?: string;
  maxWidth?: "sm" | "md" | "lg";
  children?: ReactNode;
}

export function Card({ title, description, maxWidth, children }: CardProps) {
  const widthClass = maxWidth === "sm" ? "max-w-xs" : maxWidth === "md" ? "max-w-sm" : maxWidth === "lg" ? "max-w-md" : "w-full";
  
  return (
    <div className={\`border border-border rounded-lg p-4 bg-background \${widthClass}\`}>
      {title && <div className="font-semibold text-sm mb-1">{title}</div>}
      {description && <div className="text-xs text-muted-foreground mb-2">{description}</div>}
      <div className="space-y-3">{children}</div>
    </div>
  );
}
`,
      Input: `"use client";

interface InputProps {
  label?: string;
  name?: string;
  type?: string;
  placeholder?: string;
}

export function Input({ label, name, type = "text", placeholder }: InputProps) {
  return (
    <div>
      {label && <label className="text-xs text-muted-foreground block mb-1">{label}</label>}
      <input
        type={type}
        name={name}
        placeholder={placeholder}
        className="h-9 w-full bg-background border border-border rounded px-3 text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20"
      />
    </div>
  );
}
`,
      Textarea: `"use client";

interface TextareaProps {
  label?: string;
  name?: string;
  placeholder?: string;
  rows?: number;
}

export function Textarea({ label, name, placeholder, rows = 3 }: TextareaProps) {
  return (
    <div>
      {label && <label className="text-xs text-muted-foreground block mb-1">{label}</label>}
      <textarea
        name={name}
        placeholder={placeholder}
        rows={rows}
        className="w-full bg-background border border-border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20 resize-none"
      />
    </div>
  );
}
`,
      Button: `"use client";

interface ButtonProps {
  label: string;
  variant?: "primary" | "secondary" | "outline";
  onClick?: () => void;
}

export function Button({ label, variant = "primary", onClick }: ButtonProps) {
  const baseClass = "px-4 py-2 rounded text-sm font-medium transition-colors";
  const variantClass = variant === "primary" 
    ? "bg-foreground text-background hover:bg-foreground/90"
    : variant === "outline"
    ? "border border-border hover:bg-border/50"
    : "bg-border/50 hover:bg-border";
    
  return (
    <button onClick={onClick} className={\`\${baseClass} \${variantClass}\`}>
      {label}
    </button>
  );
}
`,
      Text: `"use client";

interface TextProps {
  content: string;
  variant?: "body" | "caption" | "label";
}

export function Text({ content, variant = "body" }: TextProps) {
  const sizeClass = variant === "caption" ? "text-xs" : variant === "label" ? "text-sm font-medium" : "text-sm";
  return <p className={\`\${sizeClass} text-muted-foreground\`}>{content}</p>;
}
`,
      Heading: `"use client";

interface HeadingProps {
  text: string;
  level?: "h1" | "h2" | "h3" | "h4";
}

export function Heading({ text, level = "h2" }: HeadingProps) {
  const Tag = level;
  const sizeClass = level === "h1" ? "text-2xl" : level === "h2" ? "text-xl" : level === "h3" ? "text-lg" : "text-base";
  return <Tag className={\`\${sizeClass} font-semibold\`}>{text}</Tag>;
}
`,
      Stack: `"use client";

import { ReactNode } from "react";

interface StackProps {
  direction?: "horizontal" | "vertical";
  gap?: "sm" | "md" | "lg";
  children?: ReactNode;
}

export function Stack({ direction = "vertical", gap = "md", children }: StackProps) {
  const gapClass = gap === "sm" ? "gap-2" : gap === "lg" ? "gap-6" : "gap-4";
  const dirClass = direction === "horizontal" ? "flex-row" : "flex-col";
  return <div className={\`flex \${dirClass} \${gapClass}\`}>{children}</div>;
}
`,
      Grid: `"use client";

import { ReactNode } from "react";

interface GridProps {
  columns?: number;
  gap?: "sm" | "md" | "lg";
  children?: ReactNode;
}

export function Grid({ columns = 2, gap = "md", children }: GridProps) {
  const gapClass = gap === "sm" ? "gap-2" : gap === "lg" ? "gap-6" : "gap-4";
  return (
    <div className={\`grid \${gapClass}\`} style={{ gridTemplateColumns: \`repeat(\${columns}, 1fr)\` }}>
      {children}
    </div>
  );
}
`,
      Select: `"use client";

interface SelectProps {
  label?: string;
  name?: string;
  options?: Array<{ value: string; label: string }>;
  placeholder?: string;
}

export function Select({ label, name, options = [], placeholder }: SelectProps) {
  return (
    <div>
      {label && <label className="text-xs text-muted-foreground block mb-1">{label}</label>}
      <select
        name={name}
        className="h-9 w-full bg-background border border-border rounded px-3 text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20"
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </div>
  );
}
`,
      Checkbox: `"use client";

interface CheckboxProps {
  label?: string;
  name?: string;
  checked?: boolean;
}

export function Checkbox({ label, name, checked }: CheckboxProps) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" name={name} defaultChecked={checked} className="rounded border-border" />
      {label}
    </label>
  );
}
`,
      Radio: `"use client";

interface RadioProps {
  label?: string;
  name?: string;
  options?: Array<{ value: string; label: string }>;
}

export function Radio({ label, name, options = [] }: RadioProps) {
  return (
    <div>
      {label && <div className="text-xs text-muted-foreground mb-1">{label}</div>}
      <div className="space-y-1">
        {options.map((opt) => (
          <label key={opt.value} className="flex items-center gap-2 text-sm">
            <input type="radio" name={name} value={opt.value} className="border-border" />
            {opt.label}
          </label>
        ))}
      </div>
    </div>
  );
}
`,
      Divider: `"use client";

export function Divider() {
  return <hr className="border-border my-4" />;
}
`,
      Badge: `"use client";

interface BadgeProps {
  text: string;
  variant?: "default" | "success" | "warning" | "error";
}

export function Badge({ text, variant = "default" }: BadgeProps) {
  const colorClass = variant === "success" ? "bg-green-100 text-green-800" 
    : variant === "warning" ? "bg-yellow-100 text-yellow-800"
    : variant === "error" ? "bg-red-100 text-red-800"
    : "bg-border text-foreground";
  return <span className={\`px-2 py-0.5 rounded text-xs \${colorClass}\`}>{text}</span>;
}
`,
      Switch: `"use client";

interface SwitchProps {
  label?: string;
  name?: string;
  checked?: boolean;
}

export function Switch({ label, name, checked }: SwitchProps) {
  return (
    <label className="flex items-center justify-between gap-2 text-sm">
      {label}
      <input type="checkbox" name={name} defaultChecked={checked} className="sr-only peer" />
      <div className="w-9 h-5 bg-border rounded-full peer-checked:bg-foreground transition-colors relative after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:w-4 after:h-4 after:bg-background after:rounded-full after:transition-transform peer-checked:after:translate-x-4" />
    </label>
  );
}
`,
      Rating: `"use client";

interface RatingProps {
  label?: string;
  value?: number;
  max?: number;
}

export function Rating({ label, value = 0, max = 5 }: RatingProps) {
  return (
    <div>
      {label && <div className="text-xs text-muted-foreground mb-1">{label}</div>}
      <div className="flex gap-1">
        {Array.from({ length: max }).map((_, i) => (
          <span key={i} className={\`text-lg \${i < value ? "text-yellow-400" : "text-border"}\`}>★</span>
        ))}
      </div>
    </div>
  );
}
`,
      Form: `"use client";

import { ReactNode } from "react";

interface FormProps {
  children?: ReactNode;
}

export function Form({ children }: FormProps) {
  return <form className="space-y-4" onSubmit={(e) => e.preventDefault()}>{children}</form>;
}
`,
    };

    // Add component files
    for (const comp of components) {
      const template = componentTemplates[comp];
      if (template) {
        files.push({
          path: `components/ui/${comp.toLowerCase()}.tsx`,
          content: template,
        });
      }
    }

    // 8. components/ui/index.ts
    const indexExports = Array.from(components)
      .filter((c) => componentTemplates[c])
      .map((c) => `export { ${c} } from "./${c.toLowerCase()}";`)
      .join("\n");
    files.push({
      path: "components/ui/index.ts",
      content: indexExports + "\n",
    });

    // 9. app/page.tsx
    const jsx = generateJSX(tree.root, 2);
    const imports = Array.from(components)
      .filter((c) => componentTemplates[c])
      .sort()
      .join(", ");
    files.push({
      path: "app/page.tsx",
      content: `"use client";

import { ${imports} } from "@/components/ui";

export default function Page() {
  return (
    <div className="min-h-screen p-8 flex items-center justify-center">
${jsx}
    </div>
  );
}
`,
    });

    // 10. README.md
    files.push({
      path: "README.md",
      content: `# Generated App

This app was generated from a json-render UI tree.

## Getting Started

\`\`\`bash
npm install
npm run dev
\`\`\`

Open [http://localhost:3000](http://localhost:3000) to view.
`,
    });

    return files;
  }, [currentTree]);

  // Reset state when export modal closes
  useEffect(() => {
    if (!showExportModal) {
      setCollapsedFolders(new Set());
      setSelectedExportFile(null);
    }
  }, [showExportModal]);

  // Get active file content
  const activeExportFile =
    selectedExportFile ||
    (exportedFiles.length > 0 ? exportedFiles[0]?.path : null);
  const activeExportContent =
    exportedFiles.find((f) => f.path === activeExportFile)?.content || "";

  // Get generated page code for the code tab
  const generatedCode =
    exportedFiles.find((f) => f.path === "app/page.tsx")?.content ||
    "// Generate a UI to see the code";

  const downloadAllFiles = useCallback(() => {
    const allContent = exportedFiles
      .map((f) => `// ========== ${f.path} ==========\n${f.content}`)
      .join("\n\n");
    const blob = new Blob([allContent], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "generated-app.txt";
    a.click();
    URL.revokeObjectURL(url);
    toast("Downloaded generated-app.txt");
  }, [exportedFiles]);

  const copyFileContent = useCallback((content: string) => {
    navigator.clipboard.writeText(content);
    toast("Copied to clipboard");
  }, []);

  const isTypingSimulation = mode === "simulation" && phase === "typing";
  const isStreamingSimulation = mode === "simulation" && phase === "streaming";
  const showLoadingDots = isStreamingSimulation || isStreaming;

  const handleExampleClick = useCallback((prompt: string) => {
    setMode("interactive");
    setPhase("complete");
    setUserPrompt(prompt);
    setTimeout(() => {
      const el = inputRef.current;
      if (el) {
        el.focus();
        el.setSelectionRange(prompt.length, prompt.length);
      }
    }, 0);
  }, []);

  if (isLoadingProject) {
    return (
      <div className="w-full max-w-5xl mx-auto pb-36">
        <div className="h-[36rem] rounded-[16px] border border-[#f4f4f4] bg-white flex items-center justify-center text-sm text-muted-foreground">
          Loading project...
        </div>
      </div>
    );
  }

  return (
    <div
      className={`w-full text-left ${fullscreen ? "h-full flex flex-col" : "max-w-5xl mx-auto pb-36"}`}
    >
      {/* Prompt input */}
      <div
        className={`${
          fullscreen
            ? "mb-4 h-32 flex flex-col justify-end items-center"
            : "fixed left-1/2 -translate-x-1/2 bottom-6 z-20 w-[360px] flex flex-col justify-end items-center"
        }`}
      >
        {showExamplePrompts && (
          <div className="w-full mb-2 flex flex-wrap gap-1.5 justify-start">
            {(fullscreen
              ? examplePrompts.slice(0, 4)
              : examplePrompts.slice(0, 2)
            ).map((prompt) => (
              <button
                key={prompt}
                onClick={() => handleExampleClick(prompt)}
                className={`${
                  fullscreen ? "px-3 py-1.5" : "px-2 py-1"
                } text-xs rounded-full border border-[#f4f4f4] text-muted-foreground hover:text-foreground hover:border-[#f4f4f4] transition-colors`}
              >
                {prompt}
              </button>
            ))}
          </div>
        )}
        <div
          className="w-full border border-[#f4f4f4] rounded-[16px] pl-3 pr-2 py-2 bg-background font-mono text-sm min-h-[44px] flex items-center justify-between cursor-text"
          onClick={() => {
            if (mode === "simulation") {
              setMode("interactive");
              setPhase("complete");
              setUserPrompt("");
              setTimeout(() => inputRef.current?.focus(), 0);
            } else {
              inputRef.current?.focus();
            }
          }}
        >
          {mode === "simulation" ? (
            <div className="flex items-center flex-1">
              <span className="inline-flex items-center h-5">
                {typedPrompt}
              </span>
              {isTypingSimulation && (
                <span className="inline-block w-2 h-4 bg-foreground ml-0.5 animate-pulse" />
              )}
            </div>
          ) : (
            <form
              className="flex items-center flex-1"
              onSubmit={(e) => {
                e.preventDefault();
                handleSubmit();
              }}
            >
              <input
                ref={inputRef}
                type="text"
                value={userPrompt}
                onChange={(e) => setUserPrompt(e.target.value)}
                placeholder="Describe what you want to build..."
                className="flex-1 bg-transparent outline-none font-['Inter'] placeholder:text-muted-foreground/50 placeholder:font-['Inter'] text-sm"
                disabled={isStreaming}
                maxLength={140}
              />
            </form>
          )}
          {mode === "simulation" || isStreaming ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                stopGeneration();
              }}
              className="ml-2 w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/90 transition-colors"
              aria-label="Stop"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="currentColor"
                stroke="none"
              >
                <rect x="6" y="6" width="12" height="12" />
              </svg>
            </button>
          ) : (
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleSubmit();
              }}
              disabled={!userPrompt.trim() || isPersistingVersion}
              className="ml-2 w-7 h-7 rounded-[10px] bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/90 transition-colors disabled:opacity-30"
              aria-label="Submit"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 19V5" />
                <path d="M5 12l7-7 7 7" />
              </svg>
            </button>
          )}
        </div>
      </div>

      <div className="fixed top-4 left-6 z-30" ref={projectMenuRef}>
        <button
          onClick={() => setShowProjectMenu((prev) => !prev)}
          className="inline-flex items-center gap-1.5 rounded-[10px] border border-[#f4f4f4] bg-background/90 px-3 py-1.5 text-xs font-medium text-[#777] backdrop-blur-sm"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 40 40"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
            className="shrink-0"
          >
            <g clipPath="url(#project-logo-clip)">
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
                d="M10.9157 0.0605469H15.8317C16.9028 0.060738 17.7711 0.928819 17.7711 2V6.91602C17.771 7.98703 16.9027 8.85528 15.8317 8.85547H8.97623V2C8.97623 0.928701 9.84438 0.0605469 10.9157 0.0605469Z"
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
              <clipPath id="project-logo-clip">
                <rect width="40" height="40" fill="white" />
              </clipPath>
            </defs>
          </svg>
          <span className="mx-2">/</span>
          <span>{currentProject?.title || "New component"}</span>
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
        {showProjectMenu ? (
          <div className="mt-2 min-w-[220px] rounded-[12px] border border-[#f4f4f4] bg-white p-1.5 shadow-[0_6px_18px_rgba(0,0,0,0.08)]">
            <button
              onClick={() => {
                setShowProjectMenu(false);
                router.push("/projects");
              }}
              className="w-full text-left rounded-[8px] px-2 py-1.5 text-xs font-medium text-[#777] hover:bg-[#f7f7f7]"
            >
              Back to projects
            </button>
            <div className="my-1 h-px bg-[#f4f4f4]" />
            <div className="max-h-52 overflow-auto">
              {allProjects
                .filter((project) => project.id !== currentProject?.id)
                .map((project) => (
                  <button
                    key={project.id}
                    onClick={() => {
                      setShowProjectMenu(false);
                      router.push(`/projects/${project.id}`);
                    }}
                    className="w-full text-left rounded-[8px] px-2 py-1.5 text-xs text-[#777] hover:bg-[#f7f7f7]"
                  >
                    {project.title || "New component"}
                  </button>
                ))}
            </div>
          </div>
        ) : null}
      </div>

      <div className="fixed top-4 left-1/2 -translate-x-1/2 z-30">
        <div className="inline-flex items-center rounded-[10px] border border-[#f4f4f4] bg-background/90 p-0.5 backdrop-blur-sm">
          {(
            [
              { key: "design", label: "Design" },
              { key: "code", label: "Code" },
            ] as const
          ).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setWorkspaceView(key)}
              className={`rounded-[8px] border px-3.5 py-1.5 text-xs font-medium transition-colors ${
                workspaceView === key
                  ? "border-[#f8f8f8] bg-white text-foreground shadow-[0_1px_3px_rgba(0,0,0,0.09)]"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {workspaceView === "design" && currentTree?.root && (
        <div className="fixed top-4 right-6 z-30">
          <button
            onClick={() => {
              if (annotationMode && annotations.length > 0) {
                void createVersionFromAnnotations();
                return;
              }
              setAnnotationMode((prev) => !prev);
            }}
            className={`inline-flex items-center gap-1.5 rounded-[10px] border px-3 py-1.5 text-xs font-medium transition-colors ${
              annotationMode && annotations.length > 0
                ? "border-[#f4f4f4] bg-white text-[#22D3BB] shadow-[0_1px_3px_rgba(0,0,0,0.09)]"
                : annotationMode
                  ? "border-[#fecaca] bg-[#fff5f5] text-[#b42318] shadow-[0_1px_3px_rgba(0,0,0,0.06)]"
                  : "border-[#f4f4f4] bg-background/90 text-muted-foreground hover:text-foreground backdrop-blur-sm"
            }`}
          >
            {annotationMode && annotations.length > 0 ? (
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M20 6 9 17l-5-5" />
              </svg>
            ) : (
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                <path d="M12 7v6" />
                <path d="M9 10h6" />
              </svg>
            )}
            {annotationMode && annotations.length > 0
              ? isCreatingVersion
                ? "Creating Version..."
                : "Create Version"
              : annotationMode
                ? "Exit Annotation Mode"
                : "Annotation Mode"}
          </button>
        </div>
      )}

      <div
        className={`grid grid-cols-1 gap-4 ${fullscreen ? "flex-1 min-h-0" : ""}`}
      >
        {/* Tabbed code/stream/json panel */}
        <div
          className={`min-w-0 ${fullscreen ? "flex flex-col" : ""} ${
            workspaceView === "code" ? "block" : "hidden"
          }`}
        >
          <div className="mb-2 flex justify-center shrink-0">
            <div className="inline-flex items-center rounded-[10px] border border-[#f4f4f4] bg-[#f7f7f7] p-0.5">
              {(["json", "nested", "stream", "catalog"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`rounded-[8px] border px-3 py-1 text-[11px] font-medium transition-colors ${
                    activeTab === tab
                      ? "border-[#f8f8f8] bg-white text-foreground shadow-[0_1px_2px_rgba(0,0,0,0.06)]"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>
          <div
            className={`mx-auto w-[540px] max-w-full border border-border rounded-[20px] bg-background font-mono text-xs text-left grid relative group ${fullscreen ? "flex-1 min-h-0" : "h-[36rem]"}`}
          >
            {activeTab !== "catalog" && (
              <div className="absolute top-2 right-2 z-10">
                <CopyButton
                  text={
                    activeTab === "stream"
                      ? streamLines.join("\n")
                      : activeTab === "nested"
                        ? nestedCode
                        : jsonCode
                  }
                  className="opacity-0 group-hover:opacity-100 text-muted-foreground"
                />
              </div>
            )}
            <div
              className={`overflow-auto p-6 ${activeTab === "stream" ? "" : "hidden"}`}
            >
              {streamLines.length > 0 ? (
                <>
                  <CodeBlock
                    code={streamLines.join("\n")}
                    lang="json"
                    hideCopyButton
                  />
                  {showLoadingDots && (
                    <div className="flex gap-1 p-3 pt-0">
                      <span className="w-1 h-1 bg-muted-foreground rounded-full animate-pulse" />
                      <span className="w-1 h-1 bg-muted-foreground rounded-full animate-pulse [animation-delay:75ms]" />
                      <span className="w-1 h-1 bg-muted-foreground rounded-full animate-pulse [animation-delay:150ms]" />
                    </div>
                  )}
                </>
              ) : (
                <div className="text-muted-foreground/50 p-3 h-full">
                  {showLoadingDots ? "streaming..." : "waiting..."}
                </div>
              )}
            </div>
            <div
              className={`overflow-auto p-6 ${activeTab === "json" ? "" : "hidden"}`}
            >
              <CodeBlock code={jsonCode} lang="json" hideCopyButton />
            </div>
            <div
              className={`overflow-auto p-6 ${activeTab === "nested" ? "" : "hidden"}`}
            >
              <CodeBlock code={nestedCode} lang="json" hideCopyButton />
            </div>
            <div
              className={`overflow-auto p-6 ${activeTab === "catalog" ? "" : "hidden"}`}
            >
              <div className="h-full flex flex-col text-sm font-sans">
                <div className="flex items-center gap-3 px-3 h-9 border-b border-border">
                  {(
                    [
                      {
                        key: "components",
                        label: `components (${catalogData.components.length})`,
                      },
                      {
                        key: "actions",
                        label: `actions (${catalogData.actions.length})`,
                      },
                    ] as const
                  ).map(({ key, label }) => (
                    <button
                      key={key}
                      onClick={() => setCatalogSection(key)}
                      className={`text-xs font-mono transition-colors ${
                        catalogSection === key
                          ? "text-foreground"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div className="flex-1 overflow-auto p-3">
                  {catalogSection === "components" ? (
                    <div className="space-y-3">
                      {catalogData.components.map((comp) => (
                        <div
                          key={comp.name}
                          className="pb-3 border-b border-border last:border-b-0"
                        >
                          <div className="flex items-baseline gap-2 mb-1">
                            <span className="font-mono font-medium text-foreground">
                              {comp.name}
                            </span>
                            {comp.slots.length > 0 && (
                              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                                slots: {comp.slots.join(", ")}
                              </span>
                            )}
                          </div>
                          {comp.description && (
                            <p className="text-xs text-muted-foreground mb-2">
                              {comp.description}
                            </p>
                          )}
                          {comp.props.length > 0 && (
                            <div className="flex flex-wrap gap-1 mb-1">
                              {comp.props.map((p) => (
                                <span
                                  key={p.name}
                                  className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-green-500/10 text-green-700 dark:text-green-400"
                                >
                                  {p.name}
                                  <span className="text-green-700/50 dark:text-green-400/50">
                                    : {p.type}
                                  </span>
                                </span>
                              ))}
                            </div>
                          )}
                          {comp.events.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1.5">
                              {comp.events.map((e) => (
                                <span
                                  key={e}
                                  className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400"
                                >
                                  on.{e}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {catalogData.actions.map((action) => (
                        <div
                          key={action.name}
                          className="pb-3 border-b border-border last:border-b-0"
                        >
                          <span className="font-mono font-medium text-foreground">
                            {action.name}
                          </span>
                          {action.description && (
                            <p className="text-xs text-muted-foreground mt-1 mb-2">
                              {action.description}
                            </p>
                          )}
                          {action.params.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {action.params.map((p) => (
                                <span
                                  key={p.name}
                                  className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-green-500/10 text-green-700 dark:text-green-400"
                                >
                                  {p.name}
                                  <span className="text-green-700/50 dark:text-green-400/50">
                                    : {p.type}
                                  </span>
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Rendered output using json-render */}
        <div
          className={`min-w-0 ${fullscreen ? "flex flex-col" : ""} ${
            workspaceView === "design" ? "block" : "hidden"
          }`}
        >
          <div
            className={`shrink-0 ${
              currentTree?.root
                ? "fixed left-1/2 -translate-x-1/2 bottom-[calc(1.5rem+44px+16px)] z-20 flex justify-center"
                : "mb-2 flex justify-center"
            }`}
          >
            <div className="inline-flex items-center rounded-[10px] border border-[#f4f4f4] bg-[#f7f7f7] p-0.5">
              {(
                [
                  { key: "dynamic", label: "Live Render" },
                  { key: "static", label: "Static Code" },
                ] as const
              ).map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setRenderView(key)}
                  className={`rounded-[8px] border px-3 py-1 text-[11px] font-medium transition-colors ${
                    renderView === key
                      ? "border-[#f8f8f8] bg-white text-foreground shadow-[0_1px_2px_rgba(0,0,0,0.06)]"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div
            className={`rounded bg-background grid relative group ${fullscreen ? "flex-1 min-h-0" : "h-[36rem]"}`}
          >
            {renderView === "dynamic" ? (
              <div
                ref={renderSurfaceRef}
                onClickCapture={handleRenderSurfaceClick}
                onMouseMoveCapture={handleRenderSurfaceMouseMove}
                onMouseLeave={clearHoveredElement}
                className={`overflow-auto ${annotationMode ? "cursor-crosshair" : ""}`}
              >
                {currentTree && currentTree.root ? (
                  <div className="animate-in fade-in duration-200 w-full h-full box-border flex items-center justify-center px-3 pt-4 pb-28">
                    <PlaygroundRenderer
                      spec={currentTree}
                      loading={isStreaming || isStreamingSimulation}
                    />
                  </div>
                ) : (
                  <div className="h-full flex items-center justify-center text-muted-foreground/50 text-sm">
                    {isStreaming ? "generating..." : "waiting..."}
                  </div>
                )}
              </div>
            ) : (
              <div className="h-full overflow-auto p-6">
                <div className="mx-auto w-fit max-w-full">
                  <div className="relative rounded-[16px] border border-[#f4f4f4] bg-background p-6 font-mono text-xs text-left">
                    <div className="absolute top-3 right-3 z-10">
                      <CopyButton
                        text={generatedCode}
                        className="text-muted-foreground"
                      />
                    </div>
                    <CodeBlock code={generatedCode} lang="tsx" hideCopyButton />
                  </div>
                </div>
              </div>
            )}
          </div>
          <Toaster position="bottom-right" />
        </div>
      </div>

      {workspaceView === "design" && (
        <div className="fixed bottom-6 left-6 z-20 flex flex-col items-start gap-2">
          <button
            onClick={() => setShowExportModal(true)}
            disabled={!currentTree?.root}
            className="inline-flex items-center gap-1.5 rounded-[10px] border border-[#f4f4f4] bg-white px-2.5 py-1.5 text-[11px] font-medium text-[#777] hover:text-[#777] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            title="Export as Next.js project"
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
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Export
          </button>
          <button
            onClick={() => setIsFullscreen(true)}
            className="inline-flex items-center gap-1.5 rounded-[10px] border border-[#f4f4f4] bg-white px-2.5 py-1.5 text-[11px] font-medium text-[#777] hover:text-[#777] transition-colors"
            aria-label="Maximize"
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
            >
              <path d="M8 3H5a2 2 0 0 0-2 2v3" />
              <path d="M21 8V5a2 2 0 0 0-2-2h-3" />
              <path d="M3 16v3a2 2 0 0 0 2 2h3" />
              <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
            </svg>
            Maximize
          </button>
          <button
            onClick={() => setShowProjectSettingsModal(true)}
            className="inline-flex items-center gap-1.5 rounded-[10px] border border-[#f4f4f4] bg-white px-2.5 py-1.5 text-[11px] font-medium text-[#777] hover:text-[#777] transition-colors"
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
            >
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.08a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.08a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.08a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
            Settings
          </button>
        </div>
      )}

      {workspaceView === "design" && versions.length > 1 && (
        <div className="fixed bottom-6 right-6 z-20">
          <div className="relative">
            <select
              value={activeVersionId ?? ""}
              onChange={(e) => {
                const versionId = e.target.value;
                setActiveVersionId(versionId);
                const selected = versions.find((v) => v.id === versionId);
                if (selected?.spec) {
                  setSimulationTree(selected.spec);
                  clearSelectedElement();
                  clearHoveredElement();
                  setSelectedTarget(null);
                  setAnnotationPanelPos(null);
                }
              }}
              className="appearance-none min-w-[72px] rounded-[8px] border border-[#f4f4f4] bg-[#f7f7f7] pl-2.5 pr-7 py-1.5 text-[11px] font-medium leading-none text-[#777] outline-none"
            >
              {versions.map((version) => (
                <option key={version.id} value={version.id}>
                  {version.label}
                </option>
              ))}
            </select>
            <svg
              className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[#777]"
              width="11"
              height="11"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </div>
        </div>
      )}

      {workspaceView === "design" &&
        annotationMode &&
        annotations.map((item, idx) => (
          <div
            key={item.id}
            data-annotation-ui="true"
            className="fixed z-20 h-5 min-w-5 px-1 rounded-full bg-[#47C2FF] text-white text-[11px] font-semibold leading-5 text-center shadow-[0_2px_8px_rgba(0,0,0,0.2)]"
            style={{ top: item.markerTop, left: item.markerLeft }}
          >
            {idx + 1}
          </div>
        ))}

      {workspaceView === "design" &&
        annotationMode &&
        selectedTarget &&
        annotationPanelPos && (
          <div
            data-annotation-ui="true"
            className="fixed z-20 w-[320px] p-0"
            style={{
              top: annotationPanelPos.top,
              left: annotationPanelPos.left,
            }}
          >
            <div className="w-full border border-[#f4f4f4] rounded-[16px] pl-3 pr-2 py-2 bg-background text-sm min-h-[44px] flex items-center justify-between">
              <input
                ref={annotationInputRef}
                value={annotationInput}
                onChange={(e) => setAnnotationInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addAnnotation();
                  }
                }}
                placeholder="Describe the change for this element..."
                className="flex-1 bg-transparent outline-none font-['Inter'] placeholder:text-muted-foreground/50 text-sm"
              />
              <button
                onClick={addAnnotation}
                disabled={!selectedTarget || !annotationInput.trim()}
                className="ml-2 w-7 h-7 rounded-[10px] bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/90 transition-colors disabled:opacity-30"
                aria-label="Add annotation"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M12 19V5" />
                  <path d="M5 12l7-7 7 7" />
                </svg>
              </button>
            </div>
          </div>
        )}

      {showProjectSettingsModal && currentProject && (
        <div className="fixed inset-0 z-50 bg-black/45 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-[14px] border border-[#f4f4f4] bg-white p-5 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-sm font-semibold">
                {currentProject.title || "New component"}&apos;s Settings
              </h2>
              <button
                onClick={() => setShowProjectSettingsModal(false)}
                className="text-muted-foreground hover:text-foreground transition-colors p-1"
                aria-label="Close settings"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M18 6 6 18" />
                  <path d="m6 6 12 12" />
                </svg>
              </button>
            </div>
            <div className="mt-4 space-y-3 text-xs text-muted-foreground">
              <div>
                <div className="mb-1">Project Name</div>
                <input
                  value={projectTitleInput}
                  onChange={(e) => setProjectTitleInput(e.target.value)}
                  className="w-full rounded-[10px] border border-[#f4f4f4] bg-white px-3 py-2 text-sm text-foreground outline-none"
                  placeholder="Project name"
                />
              </div>
              <div>
                <div className="font-medium text-foreground/90">
                  Created Date
                </div>
                <div>
                  {new Date(currentProject.created_at).toLocaleString()}
                </div>
              </div>
              <div>
                <div className="font-medium text-foreground/90">
                  Last Updated Date
                </div>
                <div>
                  {new Date(currentProject.updated_at).toLocaleString()}
                </div>
              </div>
            </div>
            <div className="mt-4 flex justify-end">
              <button
                onClick={() => void saveProjectTitle()}
                disabled={isSavingProjectTitle || !projectTitleInput.trim()}
                className="rounded-[10px] border border-[#f4f4f4] bg-white px-3 py-1.5 text-xs font-medium text-[#777] disabled:opacity-50"
              >
                {isSavingProjectTitle ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Fullscreen modal */}
      {isFullscreen && (
        <div className="fixed inset-0 z-50 bg-background flex flex-col">
          <div className="flex items-center justify-between px-6 h-14 border-b border-border">
            <div className="text-sm font-mono">render</div>
            <button
              onClick={() => setIsFullscreen(false)}
              className="text-muted-foreground hover:text-foreground transition-colors p-1"
              aria-label="Close"
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M18 6L6 18" />
                <path d="M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="flex-1 overflow-auto p-6">
            {currentTree && currentTree.root ? (
              <div className="w-full min-h-full flex items-center justify-center">
                <PlaygroundRenderer
                  spec={currentTree}
                  loading={isStreaming || isStreamingSimulation}
                />
              </div>
            ) : (
              <div className="h-full flex items-center justify-center text-muted-foreground/50 text-sm">
                {isStreaming ? "generating..." : "waiting..."}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Export Modal */}
      {showExportModal && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 sm:p-8">
          <div className="bg-background border border-border rounded-lg w-full max-w-5xl h-full max-h-[80vh] flex flex-col shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between px-4 sm:px-6 h-14 border-b border-border shrink-0">
              <div className="flex items-center gap-2 sm:gap-3">
                {/* Mobile file tree toggle */}
                <button
                  onClick={() => setShowMobileFileTree(!showMobileFileTree)}
                  className="sm:hidden text-muted-foreground hover:text-foreground transition-colors p-1"
                  aria-label="Toggle file tree"
                >
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M3 6h18M3 12h18M3 18h18" />
                  </svg>
                </button>
                <span className="text-sm font-mono">export static code</span>
                <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded hidden sm:inline">
                  {exportedFiles.length} files
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={downloadAllFiles}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-foreground text-background rounded hover:bg-foreground/90 transition-colors"
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
                  >
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  Download All
                </button>
                <button
                  onClick={() => setShowExportModal(false)}
                  className="text-muted-foreground hover:text-foreground transition-colors p-1"
                  aria-label="Close"
                >
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M18 6L6 18" />
                    <path d="M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="flex flex-1 min-h-0 relative">
              {/* File Tree - hidden on mobile, overlay when shown */}
              <div
                className={`
                ${showMobileFileTree ? "absolute inset-0 z-10 bg-background" : "hidden"}
                sm:relative sm:block sm:w-56 sm:bg-transparent
                border-r border-border overflow-auto py-2
              `}
              >
                {(() => {
                  // Build tree structure from flat file list
                  type TreeNode = {
                    name: string;
                    path: string;
                    isFolder: boolean;
                    children: TreeNode[];
                    file?: { path: string; content: string };
                  };

                  const root: TreeNode = {
                    name: "",
                    path: "",
                    isFolder: true,
                    children: [],
                  };

                  exportedFiles.forEach((file) => {
                    const parts = file.path.split("/");
                    let current = root;

                    parts.forEach((part, idx) => {
                      const isLast = idx === parts.length - 1;
                      const path = parts.slice(0, idx + 1).join("/");
                      let child = current.children.find((c) => c.name === part);

                      if (!child) {
                        child = {
                          name: part,
                          path,
                          isFolder: !isLast,
                          children: [],
                          file: isLast ? file : undefined,
                        };
                        current.children.push(child);
                      }

                      current = child;
                    });
                  });

                  // Sort: folders first, then alphabetically
                  const sortNodes = (nodes: TreeNode[]): TreeNode[] => {
                    return nodes.sort((a, b) => {
                      if (a.isFolder && !b.isFolder) return -1;
                      if (!a.isFolder && b.isFolder) return 1;
                      return a.name.localeCompare(b.name);
                    });
                  };

                  const toggleFolder = (path: string) => {
                    setCollapsedFolders((prev) => {
                      const next = new Set(prev);
                      if (next.has(path)) {
                        next.delete(path);
                      } else {
                        next.add(path);
                      }
                      return next;
                    });
                  };

                  const renderNode = (
                    node: TreeNode,
                    depth: number,
                  ): React.ReactNode[] => {
                    const result: React.ReactNode[] = [];
                    const isExpanded = !collapsedFolders.has(node.path);

                    if (node.isFolder && node.name) {
                      result.push(
                        <button
                          key={`folder-${node.path}`}
                          onClick={() => toggleFolder(node.path)}
                          className="w-full text-left px-3 py-1 text-xs font-mono text-muted-foreground hover:text-foreground hover:bg-foreground/5 transition-colors"
                          style={{ paddingLeft: `${12 + depth * 12}px` }}
                        >
                          <span className="flex items-center gap-1.5">
                            <span
                              className={`text-gray-400 transition-transform ${isExpanded ? "rotate-90" : ""}`}
                            >
                              <svg
                                width="8"
                                height="8"
                                viewBox="0 0 24 24"
                                fill="currentColor"
                              >
                                <path d="M8 5l10 7-10 7V5z" />
                              </svg>
                            </span>
                            <span className="text-gray-400">
                              <svg
                                width="12"
                                height="12"
                                viewBox="0 0 24 24"
                                fill="currentColor"
                              >
                                <path d="M10 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-2z" />
                              </svg>
                            </span>
                            {node.name}
                          </span>
                        </button>,
                      );
                    }

                    if (node.file) {
                      const isActive = node.file.path === activeExportFile;
                      result.push(
                        <button
                          key={node.file.path}
                          onClick={() => {
                            setSelectedExportFile(node.file!.path);
                            setShowMobileFileTree(false);
                          }}
                          className={`w-full text-left px-3 py-1 text-xs font-mono transition-colors ${
                            isActive
                              ? "bg-foreground/10 text-foreground"
                              : "text-muted-foreground hover:text-foreground hover:bg-foreground/5"
                          }`}
                          style={{ paddingLeft: `${12 + depth * 12}px` }}
                        >
                          <span className="flex items-center gap-1.5">
                            {node.name.endsWith(".tsx") ||
                            node.name.endsWith(".ts") ? (
                              <span className="text-blue-400">
                                <svg
                                  width="12"
                                  height="12"
                                  viewBox="0 0 24 24"
                                  fill="currentColor"
                                >
                                  <path d="M3 3h18v18H3V3zm16.525 13.707c-.131-.821-.666-1.511-2.252-2.155-.552-.259-1.165-.438-1.349-.854-.068-.248-.083-.382-.039-.527.11-.373.458-.487.757-.381.193.07.37.258.482.52.51-.332.51-.332.86-.553-.132-.203-.203-.293-.297-.382-.335-.382-.78-.58-1.502-.558l-.375.047c-.361.09-.705.272-.923.531-.613.721-.437 1.976.245 2.494.674.476 1.661.59 1.791 1.052.12.543-.406.717-.919.65-.387-.071-.6-.273-.831-.641l-.871.529c.1.217.217.31.39.494.803.796 2.8.749 3.163-.476.013-.04.113-.33.071-.765zm-7.158-2.032c-.227.574-.446 1.148-.677 1.722-.204-.54-.42-1.102-.648-1.68l-.002-.02h-1.09v4.4h.798v-3.269l.796 2.011h.69l.793-2.012v3.27h.798v-4.4h-1.06l-.398 1.02v-.042zm-3.39-3.15v1.2h2.99v8.424h1.524v-8.424h2.99v-1.2H8.977z" />
                                </svg>
                              </span>
                            ) : node.name.endsWith(".json") ? (
                              <span className="text-yellow-400">
                                <svg
                                  width="12"
                                  height="12"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                >
                                  <path d="M4 4h16v16H4z" />
                                  <path d="M8 8h8M8 12h8M8 16h4" />
                                </svg>
                              </span>
                            ) : node.name.endsWith(".css") ? (
                              <span className="text-pink-400">
                                <svg
                                  width="12"
                                  height="12"
                                  viewBox="0 0 24 24"
                                  fill="currentColor"
                                >
                                  <path d="M3 3h18v18H3V3zm15.751 10.875l-.634 7.125-6.125 2-6.125-2-.625-7.125h3.125l.312 3.625 3.313 1.125 3.312-1.125.375-3.625H6.125l-.313-3.125h12.376l-.312 3.125H9.125l.25 1.875h8.376v.125z" />
                                </svg>
                              </span>
                            ) : node.name.endsWith(".md") ? (
                              <span className="text-gray-400">
                                <svg
                                  width="12"
                                  height="12"
                                  viewBox="0 0 24 24"
                                  fill="currentColor"
                                >
                                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zM13 9V3.5L18.5 9H13z" />
                                </svg>
                              </span>
                            ) : (
                              <span className="text-gray-400">
                                <svg
                                  width="12"
                                  height="12"
                                  viewBox="0 0 24 24"
                                  fill="currentColor"
                                >
                                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zM13 9V3.5L18.5 9H13z" />
                                </svg>
                              </span>
                            )}
                            {node.name}
                          </span>
                        </button>,
                      );
                    }

                    // Only render children if not a folder or if folder is expanded (or root)
                    if (!node.isFolder || !node.name || isExpanded) {
                      sortNodes(node.children).forEach((child) => {
                        result.push(
                          ...renderNode(child, node.name ? depth + 1 : depth),
                        );
                      });
                    }

                    return result;
                  };

                  return renderNode(root, 0);
                })()}
              </div>

              {/* Code Preview */}
              <div className="flex-1 flex flex-col min-w-0">
                <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-muted/30">
                  <span className="text-xs font-mono text-muted-foreground">
                    {activeExportFile}
                  </span>
                  <button
                    onClick={() => copyFileContent(activeExportContent)}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
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
                    >
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                    </svg>
                    Copy
                  </button>
                </div>
                <div className="flex-1 overflow-auto">
                  <CodeBlock
                    code={activeExportContent}
                    lang={activeExportFile?.endsWith(".json") ? "json" : "tsx"}
                    fillHeight
                    hideCopyButton
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
