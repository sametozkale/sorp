"use client";

import React, {
  useEffect,
  useLayoutEffect,
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
import { BrandLoading } from "./brand-loading";
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
type Tab = "staticCode" | "stream" | "json" | "nested" | "catalog";
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
  anchorPath: string;
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

  if (
    JSON.stringify(normalizeForComparison(baseSpec.state ?? {})) !==
    JSON.stringify(normalizeForComparison(nextSpec.state ?? {}))
  ) {
    return {
      valid: false,
      reason: "Annotation mode cannot modify shared state.",
    };
  }

  const baseKeys = Object.keys(baseSpec.elements).sort();
  const nextKeys = Object.keys(nextSpec.elements).sort();
  const sharedKeys = baseKeys.filter((key) => nextSpec.elements[key]);

  // Keep behavior-safe constraints only on shared elements.
  for (const key of sharedKeys) {
    const baseEl = baseSpec.elements[key];
    const nextEl = nextSpec.elements[key];
    if (!baseEl || !nextEl) continue;

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
  }

  if (
    JSON.stringify(normalizeForComparison(baseSpec.elements)) ===
    JSON.stringify(normalizeForComparison(nextSpec.elements))
  ) {
    return {
      valid: false,
      reason: "No annotation changes were applied.",
    };
  }

  return { valid: true };
}

function collectPropChanges(baseSpec: Spec, nextSpec: Spec): string[] {
  const changedKeys: string[] = [];
  const keys = Object.keys(baseSpec.elements);
  for (const key of keys) {
    const baseEl = baseSpec.elements[key];
    const nextEl = nextSpec.elements[key];
    if (!baseEl || !nextEl) continue;
    if (
      JSON.stringify(normalizeForComparison(baseEl.props ?? {})) !==
      JSON.stringify(normalizeForComparison(nextEl.props ?? {}))
    ) {
      changedKeys.push(key);
    }
  }
  return changedKeys;
}

function validateAnnotationIntentApplied(
  annotations: AnnotationItem[],
  baseSpec: Spec,
  nextSpec: Spec,
): { valid: boolean; reason?: string } {
  const changedKeys = collectPropChanges(baseSpec, nextSpec);
  if (changedKeys.length === 0) {
    return { valid: false, reason: "No prop changes were detected." };
  }

  const hasSquareIntent = annotations.some((a) => {
    const note = a.note.toLowerCase();
    return (
      (note.includes("square") || note.includes("kare")) &&
      (note.includes("size") ||
        note.includes("boyut") ||
        note.includes("width") ||
        note.includes("height") ||
        note.includes("1x1") ||
        note.includes("1 x 1"))
    );
  });

  if (hasSquareIntent) {
    const hasAppliedSquareChange = changedKeys.some((key) => {
      const beforeProps = (baseSpec.elements[key]?.props ?? {}) as Record<
        string,
        unknown
      >;
      const afterProps = (nextSpec.elements[key]?.props ?? {}) as Record<
        string,
        unknown
      >;
      const width = afterProps.width;
      const height = afterProps.height;
      const size = afterProps.size;

      const widthHeightEqual =
        (typeof width === "number" &&
          typeof height === "number" &&
          width === height) ||
        (typeof width === "string" &&
          typeof height === "string" &&
          width === height);

      const sizeBecameSquare =
        size !== undefined &&
        JSON.stringify(normalizeForComparison(beforeProps.size ?? null)) !==
          JSON.stringify(normalizeForComparison(size));

      return widthHeightEqual || sizeBecameSquare;
    });

    if (!hasAppliedSquareChange) {
      return {
        valid: false,
        reason:
          "Square-size annotation was not applied (width/height did not become equal).",
      };
    }
  }

  return { valid: true };
}

function extractRequestedColor(note: string): string | null {
  const hex = note.match(/#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/);
  if (hex?.[0]) return hex[0];

  const rgb = note.match(
    /rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}(?:\s*,\s*(?:0|1|0?\.\d+))?\s*\)/i,
  );
  if (rgb?.[0]) return rgb[0];

  const hsl = note.match(
    /hsla?\(\s*\d{1,3}(?:\.\d+)?(?:deg)?\s*,\s*\d{1,3}%\s*,\s*\d{1,3}%(?:\s*,\s*(?:0|1|0?\.\d+))?\s*\)/i,
  );
  if (hsl?.[0]) return hsl[0];

  const named = note.match(
    /\b(white|black|red|blue|green|yellow|orange|purple|pink|gray|grey|teal|cyan)\b/i,
  );
  return named?.[0] ?? null;
}

function isIconColorAnnotation(annotation: AnnotationItem): boolean {
  const note = annotation.note.toLowerCase();
  const target = (annotation.target || "").toLowerCase();
  const requestedColor = extractRequestedColor(annotation.note);
  const asksColor =
    note.includes("color") ||
    note.includes("colour") ||
    note.includes("renk") ||
    !!requestedColor;
  const asksIcon =
    note.includes("icon") ||
    note.includes("ikon") ||
    target.includes("icon") ||
    target.startsWith("svg");
  return asksColor && asksIcon && !!requestedColor;
}

function getSpecKeysByTypeInRenderOrder(spec: Spec, type: string): string[] {
  const ordered: string[] = [];
  const visited = new Set<string>();

  const walk = (key: string) => {
    if (!key || visited.has(key)) return;
    visited.add(key);
    const element = spec.elements[key];
    if (!element) return;
    if (element.type === type) ordered.push(key);
    for (const child of element.children ?? []) {
      walk(child);
    }
  };

  walk(spec.root);
  return ordered;
}

function enforceScopedIconColorChanges(
  baseSpec: Spec,
  nextSpec: Spec,
  annotations: AnnotationItem[],
  targetedIconIndices: Map<string, number>,
): Spec {
  if (annotations.length === 0 || targetedIconIndices.size === 0)
    return nextSpec;

  const next = JSON.parse(JSON.stringify(nextSpec)) as Spec;
  const baseIconKeys = getSpecKeysByTypeInRenderOrder(baseSpec, "Icon");
  const nextIconKeys = getSpecKeysByTypeInRenderOrder(next, "Icon");
  const allowed = new Map<number, string>();

  for (const annotation of annotations) {
    if (!isIconColorAnnotation(annotation)) continue;
    const index = targetedIconIndices.get(annotation.id);
    const requestedColor = extractRequestedColor(annotation.note);
    if (
      typeof index === "number" &&
      index >= 0 &&
      requestedColor &&
      index < nextIconKeys.length
    ) {
      allowed.set(index, requestedColor);
    }
  }

  if (allowed.size === 0) return next;
  // #region agent log
  fetch("http://127.0.0.1:7419/ingest/9745bc9e-b9a9-4725-b8b6-7ec3cc99174f", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Debug-Session-Id": "dd379c",
    },
    body: JSON.stringify({
      sessionId: "dd379c",
      runId: "run-scope-check",
      hypothesisId: "H1",
      location: "components/demo.tsx:enforceScopedIconColorChanges:allowed",
      message: "Allowed icon indices resolved for scoped color enforcement",
      data: {
        allowedEntries: Array.from(allowed.entries()),
        baseIconCount: baseIconKeys.length,
        nextIconCount: nextIconKeys.length,
      },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion

  for (let i = 0; i < nextIconKeys.length; i += 1) {
    const nextKey = nextIconKeys[i];
    if (!nextKey || !next.elements[nextKey]) continue;
    const nextElement = next.elements[nextKey];
    if (!nextElement) continue;

    if (allowed.has(i)) {
      nextElement.props = {
        ...(nextElement.props ?? {}),
        color: allowed.get(i),
      };
      continue;
    }

    const baseKey = baseIconKeys[i];
    const baseElement = baseKey ? baseSpec.elements[baseKey] : undefined;
    const baseColor = baseElement?.props?.color;
    const nextProps = { ...(nextElement.props ?? {}) } as Record<
      string,
      unknown
    >;
    if (baseColor === undefined || baseColor === null) {
      delete nextProps.color;
    } else {
      nextProps.color = baseColor;
    }
    nextElement.props = nextProps;
  }

  const changedIconIndices: number[] = [];
  const max = Math.min(baseIconKeys.length, nextIconKeys.length);
  for (let i = 0; i < max; i += 1) {
    const baseKey = baseIconKeys[i];
    const nextKey = nextIconKeys[i];
    const baseColor = baseKey
      ? baseSpec.elements[baseKey]?.props?.color
      : undefined;
    const nextColor = nextKey
      ? next.elements[nextKey]?.props?.color
      : undefined;
    if (JSON.stringify(baseColor) !== JSON.stringify(nextColor)) {
      changedIconIndices.push(i);
    }
  }
  // #region agent log
  fetch("http://127.0.0.1:7419/ingest/9745bc9e-b9a9-4725-b8b6-7ec3cc99174f", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Debug-Session-Id": "dd379c",
    },
    body: JSON.stringify({
      sessionId: "dd379c",
      runId: "run-scope-check",
      hypothesisId: "H2",
      location: "components/demo.tsx:enforceScopedIconColorChanges:result",
      message: "Scoped icon enforcement diff summary",
      data: { changedIconIndices },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion

  return next;
}

function applyAnnotationFallbackChanges(
  baseSpec: Spec,
  annotations: AnnotationItem[],
  targetedIconIndices?: Map<string, number>,
): Spec | null {
  const cloned = JSON.parse(JSON.stringify(baseSpec)) as Spec;
  let changed = false;
  const iconKeys = getSpecKeysByTypeInRenderOrder(cloned, "Icon");

  for (const annotation of annotations) {
    const note = annotation.note.toLowerCase();
    const requestedColor = extractRequestedColor(annotation.note);
    const asksColor =
      note.includes("color") ||
      note.includes("renk") ||
      note.includes("colour") ||
      !!requestedColor;
    const targetHint = (annotation.target || "").toLowerCase();
    const asksIcon =
      note.includes("icon") ||
      note.includes("ikon") ||
      targetHint.includes("icon") ||
      targetHint.startsWith("svg");

    if (asksColor && requestedColor) {
      if (asksIcon) {
        const targetedIndex = targetedIconIndices?.get(annotation.id);
        const iconKey =
          typeof targetedIndex === "number" && targetedIndex >= 0
            ? iconKeys[targetedIndex]
            : undefined;
        if (iconKey && cloned.elements[iconKey]) {
          cloned.elements[iconKey].props = {
            ...(cloned.elements[iconKey].props ?? {}),
            color: requestedColor,
          };
          changed = true;
          continue;
        }
      }

      const textLikeKey = Object.keys(cloned.elements).find((key) =>
        ["Text", "Heading", "Badge", "Button", "Alert", "Card"].includes(
          cloned.elements[key]?.type ?? "",
        ),
      );
      if (textLikeKey && cloned.elements[textLikeKey]) {
        const element = cloned.elements[textLikeKey];
        if (!element) continue;
        const nextProps = { ...(element.props ?? {}) } as Record<
          string,
          unknown
        >;
        if (element.type === "Text" || element.type === "Heading") {
          nextProps.color = requestedColor;
        } else if (element.type === "Badge" || element.type === "Button") {
          nextProps.textColor = requestedColor;
        } else if (element.type === "Alert" || element.type === "Card") {
          nextProps.textColor = requestedColor;
        } else {
          nextProps.color = requestedColor;
        }
        element.props = nextProps;
        changed = true;
      }
    }
  }

  const equivalent = areSpecsEquivalent(baseSpec, cloned);
  if (!changed) return null;
  return equivalent ? null : cloned;
}

function buildElementPathWithin(
  container: HTMLElement,
  element: HTMLElement,
): string | null {
  const segments: string[] = [];
  let current: HTMLElement | null = element;

  while (current && current !== container) {
    const parent: HTMLElement | null = current.parentElement;
    if (!parent) return null;
    const index = Array.from(parent.children).indexOf(current);
    if (index < 0) return null;
    segments.push(`:nth-child(${index + 1})`);
    current = parent;
  }

  if (current !== container) return null;
  const relativePath = segments.reverse().join(" > ");
  return relativePath ? `:scope > ${relativePath}` : ":scope";
}

function resolveElementByPath(
  container: HTMLElement,
  path: string,
): HTMLElement | null {
  if (!path) return null;
  try {
    return container.querySelector(path) as HTMLElement | null;
  } catch {
    return null;
  }
}

function getAnnotationMarkerPosition(
  anchor: HTMLElement,
  surface: HTMLElement | null,
): { top: number; left: number } {
  if (surface && surface.contains(anchor)) {
    const surfaceRect = surface.getBoundingClientRect();
    const anchorRect = anchor.getBoundingClientRect();
    return {
      top: anchorRect.top - surfaceRect.top - 10,
      left: anchorRect.left - surfaceRect.left - 10,
    };
  }

  const rect = anchor.getBoundingClientRect();
  return { top: rect.top - 10, left: rect.left - 10 };
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
  const [activeTab, setActiveTab] = useState<Tab>("staticCode");
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
  const [showVersionMenu, setShowVersionMenu] = useState(false);
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
  const [zoomMultiplier, setZoomMultiplier] = useState(1);
  const [autoFitScale, setAutoFitScale] = useState(1);
  const [isZoomEditing, setIsZoomEditing] = useState(false);
  const [zoomInputValue, setZoomInputValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const annotationInputRef = useRef<HTMLInputElement>(null);
  const zoomInputRef = useRef<HTMLInputElement>(null);
  const renderSurfaceRef = useRef<HTMLDivElement>(null);
  const renderViewportRef = useRef<HTMLDivElement>(null);
  const renderContentRef = useRef<HTMLDivElement>(null);
  const hoveredElementRef = useRef<HTMLElement | null>(null);
  const selectedElementRef = useRef<HTMLElement | null>(null);
  const annotationAnchorElementsRef = useRef<Map<string, HTMLElement>>(
    new Map(),
  );
  const latestApiSpecRef = useRef<Spec | null>(null);
  const [catalogSection, setCatalogSection] = useState<
    "components" | "actions"
  >("components");
  const [examplePrompts, setExamplePrompts] = useState(EXAMPLE_PROMPT_POOL);
  const projectMenuRef = useRef<HTMLDivElement>(null);
  const versionMenuRef = useRef<HTMLDivElement>(null);

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

      const effectiveProjectId = target ?? null;
      if (!effectiveProjectId) {
        setIsLoadingProject(false);
        router.replace("/projects");
        return;
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

  useEffect(() => {
    if (!showVersionMenu) return;
    const onClick = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (versionMenuRef.current?.contains(target)) return;
      setShowVersionMenu(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [showVersionMenu]);

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

  const selectedVersionSpec = useMemo(
    () =>
      versions.find((v) => v.id === activeVersionId)?.spec ?? simulationTree,
    [activeVersionId, simulationTree, versions],
  );

  // Determine which tree to display:
  // - Simulation mode uses staged simulation tree
  // - Interactive mode uses selected version spec as source of truth
  // - API spec is only shown while streaming a new generation
  const currentTree =
    mode === "simulation"
      ? currentSimulationStage?.tree || simulationTree
      : isStreaming
        ? apiSpec || selectedVersionSpec
        : selectedVersionSpec || apiSpec;
  const showExamplePrompts = !(currentTree && currentTree.root);
  const promptPlaceholder = currentTree?.root
    ? "Describe your revision..."
    : "Describe what you want to build...";
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
      const content = renderContentRef.current;
      if (!host || !content) return;

      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (target.closest("[data-annotation-ui='true']")) {
        clearHoveredElement();
        return;
      }
      if (!content.contains(target)) {
        clearHoveredElement();
        return;
      }

      const picked = target.closest("*") as HTMLElement | null;
      if (
        !picked ||
        !host.contains(picked) ||
        !content.contains(picked) ||
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
      const content = renderContentRef.current;
      if (!host || !content) return;
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (target.closest("[data-annotation-ui='true']")) return;
      if (!content.contains(target)) return;

      const picked = target.closest("*") as HTMLElement | null;
      if (!picked || !host.contains(picked) || !content.contains(picked))
        return;

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
    const selectedElement = selectedElementRef.current;
    const host = renderSurfaceRef.current;
    const content = renderContentRef.current;
    const anchorPath =
      selectedElement && content && content.contains(selectedElement)
        ? (buildElementPathWithin(content, selectedElement) ?? "")
        : "";
    const markerPosition = selectedElement
      ? getAnnotationMarkerPosition(selectedElement, host)
      : { top: 30, left: 30 };
    const annotationId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    if (selectedElement) {
      annotationAnchorElementsRef.current.set(annotationId, selectedElement);
    }
    setAnnotations((prev) => [
      ...prev,
      {
        id: annotationId,
        target: selectedTarget,
        note,
        markerTop: markerPosition.top,
        markerLeft: markerPosition.left,
        anchorPath,
      },
    ]);
    setAnnotationInput("");
  }, [annotationInput, selectedTarget]);

  useEffect(() => {
    if (!annotationMode || annotations.length === 0) return;
    const host = renderSurfaceRef.current;
    const content = renderContentRef.current;
    if (!host || !content) return;
    let frameId = 0;

    const recalculateMarkerPositions = () => {
      setAnnotations((prev) => {
        let changed = false;
        const next = prev.map((item) => {
          const cachedAnchor = annotationAnchorElementsRef.current.get(item.id);
          let anchor: HTMLElement | null =
            cachedAnchor &&
            cachedAnchor.isConnected &&
            content.contains(cachedAnchor)
              ? cachedAnchor
              : null;
          if (!anchor) {
            anchor = resolveElementByPath(content, item.anchorPath);
            if (anchor) {
              annotationAnchorElementsRef.current.set(item.id, anchor);
            }
          }
          if (!anchor) return item;
          const markerPosition = getAnnotationMarkerPosition(anchor, host);
          const markerTop = markerPosition.top;
          const markerLeft = markerPosition.left;
          if (
            Math.abs(markerTop - item.markerTop) < 0.5 &&
            Math.abs(markerLeft - item.markerLeft) < 0.5
          ) {
            return item;
          }
          changed = true;
          return { ...item, markerTop, markerLeft };
        });
        return changed ? next : prev;
      });
    };

    const tick = () => {
      recalculateMarkerPositions();
      frameId = window.requestAnimationFrame(tick);
    };

    recalculateMarkerPositions();
    frameId = window.requestAnimationFrame(tick);
    window.addEventListener("resize", recalculateMarkerPositions);
    window.addEventListener("scroll", recalculateMarkerPositions, true);
    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener("resize", recalculateMarkerPositions);
      window.removeEventListener("scroll", recalculateMarkerPositions, true);
    };
  }, [
    annotationMode,
    annotations.length,
    currentTree?.root,
    zoomMultiplier,
    autoFitScale,
  ]);

  const zoomOut = useCallback(() => {
    setZoomMultiplier((prev) => Math.max(0.5, Number((prev - 0.1).toFixed(2))));
  }, []);

  const zoomIn = useCallback(() => {
    setZoomMultiplier((prev) => Math.min(2, Number((prev + 0.1).toFixed(2))));
  }, []);

  const resetZoom = useCallback(() => {
    setZoomMultiplier(1);
  }, []);

  const applyCustomZoomPercent = useCallback(() => {
    const parsed = Number(zoomInputValue);
    if (!Number.isFinite(parsed)) {
      setIsZoomEditing(false);
      return;
    }
    const clampedPercent = Math.max(30, Math.min(100, Math.round(parsed)));
    const targetScale = clampedPercent / 100;
    const nextMultiplier = targetScale / Math.max(autoFitScale, 0.01);
    setZoomMultiplier(
      Math.max(0.2, Math.min(6, Number(nextMultiplier.toFixed(3)))),
    );
    setIsZoomEditing(false);
  }, [autoFitScale, zoomInputValue]);

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
        "IMPORTANT: Your output must include at least one concrete change versus previousSpec.",
        "A valid change can be a prop/style update, or an element add/remove when requested.",
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
    // Hide annotation input panel immediately after starting version creation,
    // while keeping numbered markers visible until the new version is finalized.
    setSelectedTarget(null);
    setAnnotationInput("");
    setAnnotationPanelPos(null);
    clearSelectedElement();
    clearHoveredElement();

    const targetedIconIndices = new Map<string, number>();
    const contentRoot = renderContentRef.current;
    if (contentRoot) {
      const allLucideSvgs = Array.from(
        contentRoot.querySelectorAll<Element>("svg.jr-icon-node"),
      );
      for (const annotation of annotations) {
        if (!annotation.anchorPath || !isIconColorAnnotation(annotation))
          continue;
        const anchor = resolveElementByPath(contentRoot, annotation.anchorPath);
        if (!anchor) continue;
        const svgTarget = anchor.matches("svg.jr-icon-node")
          ? (anchor as Element)
          : anchor.closest("svg.jr-icon-node");
        if (!svgTarget) continue;
        const index = allLucideSvgs.indexOf(svgTarget);
        if (index >= 0) {
          targetedIconIndices.set(annotation.id, index);
        }
      }
    }
    // #region agent log
    fetch("http://127.0.0.1:7419/ingest/9745bc9e-b9a9-4725-b8b6-7ec3cc99174f", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Debug-Session-Id": "dd379c",
      },
      body: JSON.stringify({
        sessionId: "dd379c",
        runId: "run-scope-check",
        hypothesisId: "H3",
        location: "components/demo.tsx:createVersionFromAnnotations:target-map",
        message: "Computed targeted icon index map from annotation anchors",
        data: {
          annotationCount: annotations.length,
          targetedEntries: Array.from(targetedIconIndices.entries()),
          iconColorAnnotationIds: annotations
            .filter((annotation) => isIconColorAnnotation(annotation))
            .map((annotation) => annotation.id),
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion

    const instructions = annotations
      .map((a, index) => `${index + 1}. Target ${a.target}: ${a.note}`)
      .join("\n");
    const prompt = [
      "Apply these visual annotations to the current UI.",
      "STRICT RULES:",
      "- Change ONLY what is explicitly requested in annotations.",
      "- You MAY add or remove elements if the annotation explicitly requires it.",
      "- Keep root element stable.",
      "- Do NOT change state, bindings, events, or repeat logic.",
      "- Keep edits minimal and directly related to the annotation text.",
      "",
      instructions,
    ].join("\n");
    setIsCreatingVersion(true);
    try {
      let produced = await requestChangedSpec(prompt, currentTree);
      if (produced?.root && areSpecsEquivalent(produced, currentTree)) {
        const retryPrompt = [
          prompt,
          "",
          "IMPORTANT RETRY:",
          "- Your previous output was identical to the current spec.",
          "- You MUST apply at least one concrete change based on the annotations.",
          "- A valid change can be prop update, element add, or element removal (if requested).",
          "- Keep all strict rules and avoid unrelated edits.",
        ].join("\n");
        produced = await requestChangedSpec(retryPrompt, currentTree);
      }
      if (!produced?.root) {
        toast.error("Could not create a new version. Please try again.");
        return;
      }
      if (areSpecsEquivalent(produced, currentTree)) {
        const fallbackSpec = applyAnnotationFallbackChanges(
          currentTree,
          annotations,
          targetedIconIndices,
        );
        if (
          fallbackSpec?.root &&
          !areSpecsEquivalent(fallbackSpec, currentTree)
        ) {
          produced = fallbackSpec;
          toast("Applied annotation fallback changes. Review the new version.");
        } else {
          toast.error(
            "No changes were applied. Try a more specific annotation.",
          );
          return;
        }
      }
      produced = enforceScopedIconColorChanges(
        currentTree,
        produced,
        annotations,
        targetedIconIndices,
      );
      // #region agent log
      fetch(
        "http://127.0.0.1:7419/ingest/9745bc9e-b9a9-4725-b8b6-7ec3cc99174f",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Debug-Session-Id": "dd379c",
          },
          body: JSON.stringify({
            sessionId: "dd379c",
            runId: "run-scope-check",
            hypothesisId: "H4",
            location:
              "components/demo.tsx:createVersionFromAnnotations:post-enforce-equivalence",
            message: "Equivalence status after scoped icon enforcement",
            data: {
              equivalentAfterEnforce: areSpecsEquivalent(currentTree, produced),
            },
            timestamp: Date.now(),
          }),
        },
      ).catch(() => {});
      // #endregion
      const annotationValidation = validateAnnotationOnlyChanges(
        currentTree,
        produced,
      );
      if (!annotationValidation.valid) {
        const reason = annotationValidation.reason || "";
        const structuralButApplicable =
          reason.includes("cannot add or remove elements") ||
          reason.includes("cannot change component hierarchy");
        const hasPropChanges =
          collectPropChanges(currentTree, produced).length > 0;

        if (structuralButApplicable && hasPropChanges) {
          toast(
            "Annotation may include minor structural updates. Saved because prop changes were applied.",
          );
        } else {
          toast.error(
            annotationValidation.reason ||
              "Annotation update changed more than requested.",
          );
          return;
        }
      }
      const annotationIntentValidation = validateAnnotationIntentApplied(
        annotations,
        currentTree,
        produced,
      );
      if (!annotationIntentValidation.valid) {
        toast(
          annotationIntentValidation.reason ||
            "Annotation intent may be partially applied. Review the new version.",
        );
      }
      if (produced?.root) {
        const saved = await saveAsNextVersion(produced);
        if (saved) {
          setAnnotations([]);
          annotationAnchorElementsRef.current.clear();
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

  useLayoutEffect(() => {
    const viewport = renderViewportRef.current;
    const content = renderContentRef.current;
    if (!viewport || !content) return;

    const recalculateFit = () => {
      const viewportWidth = Math.max(0, viewport.clientWidth - 24);
      const reservedBottomSpace = fullscreen ? 16 : 96;
      const viewportHeight = Math.max(
        0,
        viewport.clientHeight - 24 - reservedBottomSpace,
      );
      const contentWidth = content.scrollWidth;
      const contentHeight = content.scrollHeight;

      if (!contentWidth || !contentHeight || !currentTree?.root) {
        setAutoFitScale(1);
        return;
      }

      const widthScale = viewportWidth / contentWidth;
      const heightScale = viewportHeight / contentHeight;
      const fit = Math.min(1, widthScale, heightScale);
      setAutoFitScale(Number.isFinite(fit) && fit > 0 ? fit : 1);
    };

    recalculateFit();
    const resizeObserver = new ResizeObserver(recalculateFit);
    resizeObserver.observe(viewport);
    resizeObserver.observe(content);
    window.addEventListener("resize", recalculateFit);
    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", recalculateFit);
    };
  }, [currentTree?.root, currentTree, workspaceView]);

  useEffect(() => {
    if (!isZoomEditing) return;
    zoomInputRef.current?.focus();
    zoomInputRef.current?.select();
  }, [isZoomEditing]);

  useEffect(() => {
    // Always start each newly shown component/version from best-fit zoom.
    // User can then adjust manually with zoom controls.
    setZoomMultiplier(1);
    setIsZoomEditing(false);
  }, [activeVersionId, resolvedProjectId]);

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
    const prompt = userPrompt.trim();
    setUserPrompt("");
    setStreamLines([]);
    const produced = await requestChangedSpec(prompt, currentTree ?? undefined);
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
  const otherProjects = allProjects.filter(
    (project) => project.id !== currentProject?.id,
  );
  const fullscreenProjectTitle = (() => {
    const raw = (currentProject?.title || "New component").trim();
    if (!raw) return "New component";
    return raw.charAt(0).toUpperCase() + raw.slice(1);
  })();
  const effectiveScale = Math.max(
    0.2,
    Math.min(2.5, autoFitScale * zoomMultiplier),
  );

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
    return <BrandLoading label="Project loading..." />;
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
                } max-w-full truncate whitespace-nowrap text-xs rounded-full border border-[#f4f4f4] text-muted-foreground hover:text-foreground hover:border-[#f4f4f4] transition-colors`}
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
                placeholder={promptPlaceholder}
                className="input-app-font flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/50"
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
              className="ml-2 btn-primary btn-primary-icon"
              aria-label="Stop"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="currentColor"
                stroke="none"
              >
                <rect x="6" y="6" width="12" height="12" rx="2" />
              </svg>
            </button>
          ) : (
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleSubmit();
              }}
              disabled={!userPrompt.trim() || isPersistingVersion}
              className="ml-2 btn-primary btn-primary-icon disabled:opacity-30"
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

      <div
        className="fixed top-4 left-[24px] z-30 inline-block"
        style={{ left: 24 }}
        ref={projectMenuRef}
      >
        <button
          onClick={() => setShowProjectMenu((prev) => !prev)}
          className="inline-flex h-[34px] items-center gap-1.5 rounded-[10px] border border-[#f4f4f4] bg-background/90 px-3 py-1.5 text-xs font-medium text-[#777] backdrop-blur-sm"
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
          <span className="mx-1 text-[#ccc]">/</span>
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
          <div className="absolute left-0 top-full mt-2 w-max min-w-[180px] max-w-[280px] rounded-[12px] border border-[#f4f4f4] bg-white p-1.5 shadow-[0_6px_18px_rgba(0,0,0,0.08)]">
            <button
              onClick={() => {
                setShowProjectMenu(false);
                router.push("/projects");
              }}
              className="w-full inline-flex items-center gap-1.5 text-left rounded-[8px] px-2 py-1.5 text-xs font-medium text-[#777] hover:bg-[#f7f7f7]"
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
                <path d="m15 18-6-6 6-6" />
              </svg>
              Back to projects
            </button>
            {otherProjects.length > 0 ? (
              <div className="mx-2 my-1 h-px bg-[#f4f4f4]" />
            ) : null}
            <div className="max-h-52 overflow-auto">
              {otherProjects.map((project) => (
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
        <div className="fixed top-4 right-[24px] z-30" style={{ right: 24 }}>
          <button
            onClick={() => {
              if (annotationMode && annotations.length > 0) {
                void createVersionFromAnnotations();
                return;
              }
              setAnnotationMode((prev) => !prev);
            }}
            className={`inline-flex h-[34px] items-center gap-1.5 rounded-[10px] border px-3 py-1.5 text-xs font-medium transition-colors ${
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
              {(
                [
                  { key: "staticCode", label: "Static Code" },
                  { key: "json", label: "json" },
                  { key: "nested", label: "nested" },
                  { key: "stream", label: "stream" },
                  { key: "catalog", label: "catalog" },
                ] as const
              ).map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setActiveTab(key)}
                  className={`rounded-[8px] border px-3 py-1 text-[11px] font-medium transition-colors ${
                    activeTab === key
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
            className={`mx-auto w-[540px] max-w-full border border-border rounded-[20px] bg-background font-mono text-xs text-left grid relative group ${fullscreen ? "flex-1 min-h-0" : "h-[36rem]"}`}
          >
            {activeTab !== "catalog" && (
              <div className="absolute top-2 right-2 z-10">
                <CopyButton
                  text={
                    activeTab === "staticCode"
                      ? generatedCode
                      : activeTab === "stream"
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
              className={`overflow-auto p-6 ${activeTab === "staticCode" ? "" : "hidden"}`}
            >
              <CodeBlock code={generatedCode} lang="tsx" hideCopyButton />
            </div>
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
            className={`rounded bg-background grid relative group ${fullscreen ? "flex-1 min-h-0" : "h-[calc(100vh-9rem)] min-h-[32rem]"}`}
          >
            <div
              ref={(node) => {
                renderViewportRef.current = node;
                renderSurfaceRef.current = node;
              }}
              onClickCapture={handleRenderSurfaceClick}
              onMouseMoveCapture={handleRenderSurfaceMouseMove}
              onMouseLeave={clearHoveredElement}
              className={`${annotationMode ? "cursor-crosshair" : ""} relative overflow-hidden`}
            >
              {currentTree && currentTree.root ? (
                <div
                  className={`animate-in fade-in duration-200 w-full h-full box-border flex justify-center p-3 ${
                    autoFitScale < 0.999 ? "items-start pt-4" : "items-center"
                  }`}
                >
                  <div
                    ref={renderContentRef}
                    style={{
                      zoom: effectiveScale,
                    }}
                  >
                    <PlaygroundRenderer
                      spec={currentTree}
                      loading={isStreaming || isStreamingSimulation}
                    />
                  </div>
                </div>
              ) : isStreaming || isStreamingSimulation ? (
                <div className="h-full flex items-center justify-center">
                  <div className="inline-flex items-center gap-2 text-sm font-medium text-[#777]">
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 40 40"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                      aria-hidden="true"
                      className="shrink-0"
                    >
                      <g clipPath="url(#generating-logo-clip)">
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
                        <clipPath id="generating-logo-clip">
                          <rect width="40" height="40" fill="white" />
                        </clipPath>
                      </defs>
                    </svg>
                    <span>Generating...</span>
                  </div>
                </div>
              ) : (
                <div className="h-full" />
              )}
              {annotationMode &&
                annotations.map((item, idx) => (
                  <div
                    key={item.id}
                    data-annotation-ui="true"
                    className="absolute z-20 h-5 min-w-5 px-1 rounded-full bg-[#47C2FF] text-white text-[11px] font-semibold leading-5 text-center shadow-[0_2px_8px_rgba(0,0,0,0.2)] pointer-events-none"
                    style={{ top: item.markerTop, left: item.markerLeft }}
                  >
                    {idx + 1}
                  </div>
                ))}
            </div>
          </div>
          <Toaster position="bottom-right" />
        </div>
      </div>

      {workspaceView === "design" && (
        <div className="fixed bottom-6 left-6 z-20 flex flex-col items-start gap-2">
          <button
            onClick={() => setShowExportModal(true)}
            disabled={!currentTree?.root}
            className="inline-flex h-7 items-center gap-1.5 rounded-[10px] border border-[#f4f4f4] bg-white px-2.5 text-[11px] font-medium text-[#777] hover:text-[#777] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
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
            className="inline-flex h-7 items-center gap-1.5 rounded-[10px] border border-[#f4f4f4] bg-white px-2.5 text-[11px] font-medium text-[#777] hover:text-[#777] transition-colors"
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
            className="inline-flex h-7 items-center gap-1.5 rounded-[10px] border border-[#f4f4f4] bg-white px-2.5 text-[11px] font-medium text-[#777] hover:text-[#777] transition-colors"
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
        <div className="fixed right-6 bottom-[calc(1.5rem+28px+8px)] z-20">
          <div className="relative" ref={versionMenuRef}>
            <button
              onClick={() => setShowVersionMenu((prev) => !prev)}
              className="inline-flex h-7 w-[56px] items-center justify-center gap-2 rounded-[8px] border border-[#f4f4f4] bg-[#f7f7f7] px-2 text-[11px] font-medium leading-none text-[#777]"
              aria-label="Select version"
            >
              <span>
                {versions.find((v) => v.id === activeVersionId)?.label ||
                  versions[versions.length - 1]?.label}
              </span>
              <svg
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
            </button>
            {showVersionMenu ? (
              <div className="absolute right-0 bottom-full mb-1 min-w-[72px] rounded-[8px] border border-[#f4f4f4] bg-[#f7f7f7] p-1 shadow-[0_6px_18px_rgba(0,0,0,0.08)]">
                {versions.map((version) => (
                  <button
                    key={version.id}
                    onClick={() => {
                      setShowVersionMenu(false);
                      setActiveVersionId(version.id);
                      if (version.spec) {
                        setSimulationTree(version.spec);
                        clearSelectedElement();
                        clearHoveredElement();
                        setSelectedTarget(null);
                        setAnnotationPanelPos(null);
                      }
                    }}
                    className={`w-full rounded-[6px] px-2 py-1 text-left text-[11px] font-medium ${
                      activeVersionId === version.id
                        ? "bg-white text-foreground"
                        : "text-[#777] hover:bg-white/70"
                    }`}
                  >
                    {version.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      )}

      {workspaceView === "design" && currentTree?.root && (
        <div className="fixed right-6 bottom-6 z-20">
          <div className="inline-flex h-7 items-center rounded-[8px] border border-[#f4f4f4] bg-[#f7f7f7] p-0.5 text-[#777]">
            <button
              onClick={zoomOut}
              className="inline-flex h-6 w-6 items-center justify-center rounded-[6px] hover:bg-white/80"
              aria-label="Zoom out"
            >
              <svg
                width="11"
                height="11"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M5 12h14" />
              </svg>
            </button>
            {isZoomEditing ? (
              <input
                ref={zoomInputRef}
                type="number"
                min={30}
                max={100}
                value={zoomInputValue}
                onChange={(e) => setZoomInputValue(e.target.value)}
                onBlur={applyCustomZoomPercent}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    applyCustomZoomPercent();
                  }
                  if (e.key === "Escape") {
                    e.preventDefault();
                    setIsZoomEditing(false);
                  }
                }}
                className="w-[44px] rounded-[6px] px-1 py-1 text-[10px] font-medium bg-white/80 text-center outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                aria-label="Custom zoom percent"
              />
            ) : (
              <button
                onClick={() => {
                  setZoomInputValue(String(Math.round(effectiveScale * 100)));
                  setIsZoomEditing(true);
                }}
                className="min-w-[44px] rounded-[6px] px-1.5 py-1 text-[10px] font-medium hover:bg-white/80"
                title="Click to set custom zoom (30-100)"
              >
                {Math.round(effectiveScale * 100)}%
              </button>
            )}
            <button
              onClick={zoomIn}
              className="inline-flex h-6 w-6 items-center justify-center rounded-[6px] hover:bg-white/80"
              aria-label="Zoom in"
            >
              <svg
                width="11"
                height="11"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 5v14" />
                <path d="M5 12h14" />
              </svg>
            </button>
          </div>
        </div>
      )}

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
                className="input-app-font flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/50"
              />
              <button
                onClick={addAnnotation}
                disabled={!selectedTarget || !annotationInput.trim()}
                className="ml-2 btn-primary btn-primary-icon disabled:opacity-30"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-[2px]">
          <div className="w-full max-w-lg rounded-[16px] border border-[#ececec] bg-white p-6 shadow-[0_22px_70px_rgba(0,0,0,0.2)]">
            <div className="flex items-start justify-between gap-3 border-b border-[#f2f2f2] pb-4">
              <div>
                <h2 className="text-[17px] font-semibold tracking-[-0.01em] text-foreground">
                  {currentProject.title || "New component"}&apos;s Settings
                </h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Update project details and review metadata.
                </p>
              </div>
              <button
                onClick={() => setShowProjectSettingsModal(false)}
                className="rounded-[8px] p-1.5 text-muted-foreground transition-colors hover:bg-[#f7f7f7] hover:text-foreground"
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
            <div className="mt-5 space-y-4">
              <div>
                <div className="mb-1.5 text-xs font-medium text-foreground/90">
                  Project Name
                </div>
                <input
                  value={projectTitleInput}
                  onChange={(e) => setProjectTitleInput(e.target.value)}
                  className="w-full rounded-[12px] border border-[#ececec] bg-white px-3.5 py-2.5 text-sm text-foreground outline-none transition focus:border-[#d8d8d8] focus:shadow-[0_0_0_3px_rgba(34,211,187,0.12)]"
                  placeholder="Project name"
                />
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="rounded-[12px] border border-[#f1f1f1] bg-[#fcfcfc] px-3 py-2.5">
                  <div className="text-[11px] font-medium uppercase tracking-[0.04em] text-muted-foreground">
                    Created Date
                  </div>
                  <div className="mt-1 text-sm text-foreground/85">
                    {new Date(currentProject.created_at).toLocaleString()}
                  </div>
                </div>
                <div className="rounded-[12px] border border-[#f1f1f1] bg-[#fcfcfc] px-3 py-2.5">
                  <div className="text-[11px] font-medium uppercase tracking-[0.04em] text-muted-foreground">
                    Last Updated Date
                  </div>
                  <div className="mt-1 text-sm text-foreground/85">
                    {new Date(currentProject.updated_at).toLocaleString()}
                  </div>
                </div>
              </div>
            </div>
            <div className="mt-6 flex justify-end">
              <button
                onClick={() => void saveProjectTitle()}
                disabled={isSavingProjectTitle || !projectTitleInput.trim()}
                className="inline-flex h-[34px] items-center rounded-[10px] border border-[#f4f4f4] bg-white px-4 text-xs font-medium text-[#4b4b4b] shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition hover:bg-[#f7f7f7] disabled:cursor-not-allowed disabled:opacity-45"
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
          <div className="flex items-center justify-between px-6 h-11 border-b border-border">
            <div className="text-sm font-medium">{fullscreenProjectTitle}</div>
            <button
              onClick={() => setIsFullscreen(false)}
              className="text-muted-foreground hover:text-foreground transition-colors p-0.5"
              aria-label="Close"
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
