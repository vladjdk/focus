import { useEffect, useRef, useState } from "react";
import {
  Plus,
  Minus,
  Maximize,
  MousePointer2,
  Hand,
  Check,
  Grip,
  X,
  RotateCcw,
  Trash2,
  Link2,
  ExternalLink,
  ChevronDown,
  Keyboard,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  seedTasks,
  type Task,
  type Link,
  quadrants,
  positionFor,
  quadrantAt,
  snapTo,
  QUAD,
  CARD,
} from "@/lib/tasks";
import {
  ageInfo,
  Bin,
  CalendarIcon,
  CONFETTI,
  dueInfo,
  Flame,
  FlameDefs,
  Hourglass,
  PaperBall,
  prefersReducedMotion,
  Sparkle,
  Sprout,
} from "./card-status";
import {
  DoneBadge,
  DoneCard,
  EmptyDone,
  groupDone,
  whenDone,
} from "./done-list";
import { UpdateButton, UpdatedToast } from "./update";

const HEAT_CLASS = ["", "heat-soon", "heat-warm", "heat-hot", "heat-late"];
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
// crypto.randomUUID only exists in secure contexts, so it's missing on plain
// http hostnames like http://tasks:5180; getRandomValues works everywhere.
function newId() {
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
/** Local YYYY-MM-DD for today plus `offset` days. */
function isoDay(offset: number, now: number) {
  const d = new Date(now);
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** True while the user is typing, so single-key shortcuts stay out of the way. */
function isTyping(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  return (
    !!el &&
    (el.isContentEditable ||
      ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName))
  );
}
// Stands in for the four keys behind ⌥1-4, labelled for the viewer's layout.
const QUAD_KEYS = "quad-keys";
const SHORTCUTS: { title: string; keys: [string[], string][] }[] = [
  {
    title: "Tasks",
    keys: [
      [["N"], "New task"],
      [["1", "2", "3", "4"], "New task in that quadrant"],
      [["C"], "Show completed tasks"],
    ],
  },
  {
    title: "Card under the pointer or focused",
    keys: [
      [["E"], "Edit"],
      [["X"], "Complete"],
      [["⌫"], "Delete"],
      [["⌥", "Arrow"], "Move to the next quadrant (focused card)"],
    ],
  },
  {
    title: "Board",
    keys: [
      [["V"], "Select tool"],
      [["H"], "Hand tool"],
      [["Space"], "Hold to pan"],
      [["+"], "Zoom in"],
      [["−"], "Zoom out"],
      [["0"], "Reset view"],
    ],
  },
  {
    title: "In the editor",
    keys: [
      [["⌥", QUAD_KEYS], "Move the task to that quadrant"],
      [["⌘", "Enter"], "Save"],
    ],
  },
  {
    title: "Anywhere",
    keys: [
      [["?"], "Show these shortcuts"],
      [["Esc"], "Close a dialog"],
    ],
  },
];

// Unsaved editor contents, kept in this browser so closing the editor or the
// page never loses typing. Keyed by task id, or NEW_DRAFT for a new task.
const DRAFTS_KEY = "focus-drafts",
  NEW_DRAFT = "new";
type Drafts = Record<string, Task>;
function loadDrafts(): Drafts {
  try {
    return JSON.parse(localStorage.getItem(DRAFTS_KEY) ?? "{}") ?? {};
  } catch {
    return {};
  }
}
const EDITABLE = ["title", "notes", "q", "due", "sources", "links"] as const;
function sameEdits(a: Task, b: Task) {
  return EDITABLE.every(
    (k) => JSON.stringify(a[k] ?? "") === JSON.stringify(b[k] ?? ""),
  );
}
function isBlank(t: Task) {
  return (
    !t.title.trim() &&
    !t.notes.trim() &&
    !t.due &&
    !t.sources?.length &&
    !t.links?.length
  );
}

function cleanLinks(items: Link[] = []) {
  return items
    .map((l) => ({ label: l.label.trim(), url: l.url.trim() }))
    .filter((l) => l.url)
    .map((l) => ({ ...l, label: l.label || hostOf(l.url) }));
}
function hostOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
function LinkEditor({
  title,
  items = [],
  onChange,
}: {
  title: string;
  items?: Link[];
  onChange: (v: Link[]) => void;
}) {
  const set = (i: number, p: Partial<Link>) =>
    onChange(items.map((l, j) => (j === i ? { ...l, ...p } : l)));
  return (
    <div className="link-editor">
      <div className="link-head">
        <span className="field-label">
          <Link2 size={14} />
          {title}
          {items.length > 0 && <em>{items.length}</em>}
        </span>
        <button
          type="button"
          onClick={() => onChange([...items, { label: "", url: "" }])}
        >
          <Plus size={14} />
          Add
        </button>
      </div>
      {items.map((l, i) => (
        <div className="link-row" key={i}>
          <input
            aria-label={`${title} name`}
            placeholder="Name"
            maxLength={200}
            value={l.label}
            onChange={(e) => set(i, { label: e.target.value })}
          />
          <input
            aria-label={`${title} URL`}
            type="url"
            pattern="https?://.+"
            placeholder="https://…"
            maxLength={2000}
            value={l.url}
            onChange={(e) => set(i, { url: e.target.value })}
          />
          {/^https?:\/\//i.test(l.url) && (
            <a
              href={l.url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Open ${l.label || "link"}`}
            >
              <ExternalLink size={15} />
            </a>
          )}
          <button
            type="button"
            aria-label="Remove link"
            onClick={() => onChange(items.filter((_, j) => j !== i))}
          >
            <X size={15} />
          </button>
        </div>
      ))}
    </div>
  );
}

export default function Home() {
  const [tasks, setTasks] = useState<Task[]>(seedTasks),
    [ready, setReady] = useState(false),
    [status, setStatus] = useState("Loading your board…");
  const [view, setView] = useState({ x: 0, y: 0, scale: 0.75 }),
    [mode, setMode] = useState("select"),
    [dragging, setDragging] = useState<string | null>(null),
    [over, setOver] = useState<number | null>(null);
  const [edit, setEdit] = useState<Task | null>(null),
    [completed, setCompleted] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const viewport = useRef<HTMLDivElement>(null),
    toolbox = useRef<HTMLDivElement>(null),
    tasksRef = useRef(tasks),
    viewRef = useRef(view),
    gesture = useRef<any>(null),
    space = useRef(false);
  tasksRef.current = tasks;
  viewRef.current = view;
  // Animation state: which cards are mid-sprout / mid-completion / mid-toss.
  const [sprouting, setSprouting] = useState<string[]>([]),
    [completing, setCompleting] = useState<string[]>([]),
    [tossing, setTossing] = useState<string[]>([]),
    [confirmToss, setConfirmToss] = useState<Task | null>(null),
    [bump, setBump] = useState(false),
    [openDone, setOpenDone] = useState<string | null>(null),
    [help, setHelp] = useState(false),
    // What the physical 1-4 keys type on this keyboard layout, for labels.
    [digitKeys, setDigitKeys] = useState(["1", "2", "3", "4"]),
    [drafts, setDrafts] = useState<Drafts>(loadDrafts),
    [now, setNow] = useState(() => Date.now());
  const cardEls = useRef(new Map<string, HTMLElement>()),
    hovered = useRef<string | null>(null),
    completedBtn = useRef<HTMLButtonElement>(null);
  const animating = (id: string) =>
    completing.includes(id) || tossing.includes(id);
  useEffect(() => {
    try {
      localStorage.setItem(DRAFTS_KEY, JSON.stringify(drafts));
    } catch {}
  }, [drafts]);
  function setDraft(key: string, t: Task | null) {
    setDrafts((d) => {
      if (!t && !(key in d)) return d;
      const next = { ...d };
      if (t) next[key] = t;
      else delete next[key];
      return next;
    });
  }
  // Every change in the editor is kept as a draft until it's saved or discarded.
  useEffect(() => {
    if (!edit) return;
    const saved = tasksRef.current.find((t) => t.id === edit.id);
    if (saved) setDraft(edit.id, sameEdits(edit, saved) ? null : edit);
    else setDraft(NEW_DRAFT, isBlank(edit) ? null : edit);
  }, [edit]);
  // Forget drafts of cards that have since been completed or deleted.
  useEffect(() => {
    if (!ready) return;
    const open = new Set(tasks.filter((t) => !t.done).map((t) => t.id));
    setDrafts((d) => {
      const stale = Object.keys(d).filter(
        (k) => k !== NEW_DRAFT && !open.has(k),
      );
      if (!stale.length) return d;
      const next = { ...d };
      for (const k of stale) delete next[k];
      return next;
    });
  }, [tasks, ready]);
  /** Open a card in the editor, picking up any unsaved draft of it. */
  function openTask(t: Task) {
    const d = drafts[t.id];
    setEdit(
      d ? { ...t, ...Object.fromEntries(EDITABLE.map((k) => [k, d[k]])) } : t,
    );
  }
  useEffect(() => {
    // Chromium only, in secure contexts; elsewhere the labels stay 1-4.
    (navigator as any).keyboard
      ?.getLayoutMap?.()
      .then((m: Map<string, string>) => {
        const keys = [1, 2, 3, 4].map((n) => m.get(`Digit${n}`));
        if (keys.every(Boolean)) setDigitKeys(keys as string[]);
      })
      .catch(() => {});
  }, []);
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 5 * 60_000);
    return () => clearInterval(tick);
  }, []);
  function fit() {
    const r = viewport.current?.getBoundingClientRect();
    if (!r) return;
    // Fit the board into the space above the floating toolbar, not behind it.
    const t = toolbox.current?.getBoundingClientRect();
    const h = t ? t.top - r.top : r.height;
    // Frame the drawn content (row labels at x=0 to the right quadrants' edge
    // at x=1700; column labels at y=130 to the bottom quadrants' edge at
    // y=1430), not the canvas's empty padding around it.
    const left = 0,
      right = 1700,
      top = 130,
      bottom = 1430;
    const scale = Math.min(
      (r.width - 48) / (right - left),
      (h - 48) / (bottom - top),
      1,
    );
    setView({
      x: (r.width - (right - left) * scale) / 2 - left * scale,
      y: (h - (bottom - top) * scale) / 2 - top * scale,
      scale,
    });
  }
  async function load() {
    setStatus("Loading your board…");
    try {
      const r = await fetch("/api/tasks");
      if (!r.ok) throw Error();
      const d = (await r.json()) as { tasks: Task[] };
      setTasks(d.tasks);
      setReady(true);
      setStatus("All changes saved");
      setError("");
    } catch {
      setStatus("Could not load board");
      setError("Your board could not be loaded. Please retry.");
    }
  }
  useEffect(() => {
    fit();
    void load();
    const resize = () => fit();
    window.addEventListener("resize", resize);
    const down = (e: KeyboardEvent) => {
      if (e.code === "Space" && !isTyping(e.target)) {
        space.current = true;
        e.preventDefault();
      }
    };
    const up = () => (space.current = false);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("resize", resize);
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);
  async function persist(t: Task, remove = false) {
    if (!ready) throw Error("Board is not loaded");
    setStatus("Saving…");
    const r = await fetch("/api/tasks", {
      method: remove ? "DELETE" : "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(t),
    });
    if (!r.ok) {
      setStatus("Changes not saved");
      throw Error(
        "Could not save. Your previous board is unchanged. Please try again.",
      );
    }
    setTasks((prev) =>
      remove
        ? prev.filter((a) => a.id !== t.id)
        : prev.some((a) => a.id === t.id)
          ? prev.map((a) => (a.id === t.id ? t : a))
          : [...prev, t],
    );
    setStatus("All changes saved");
  }
  async function change(t: Task) {
    try {
      await persist(t);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function zoom(mult: number) {
    const r = viewport.current!.getBoundingClientRect();
    setView((v) => {
      const scale = Math.max(0.25, Math.min(1.6, v.scale * mult));
      return {
        scale,
        x: r.width / 2 - ((r.width / 2 - v.x) * scale) / v.scale,
        y: r.height / 2 - ((r.height / 2 - v.y) * scale) / v.scale,
      };
    });
  }
  function start(e: React.PointerEvent, t?: Task) {
    if (e.button !== 0 && e.button !== 1) return;
    const middle = e.button === 1;
    if (!middle && (e.target as HTMLElement).closest("button,a")) return;
    const pan = middle || !t || mode === "hand" || space.current;
    if (!pan && (!ready || animating(t!.id))) return;
    if (middle) e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    gesture.current = {
      id: pan ? null : t!.id,
      startX: e.clientX,
      startY: e.clientY,
      view: { ...viewRef.current },
      task: t ? { ...t } : null,
      moved: false,
    };
    if (!pan) setDragging(t!.id);
  }
  function move(e: React.PointerEvent) {
    const g = gesture.current;
    if (!g) return;
    const dx = e.clientX - g.startX,
      dy = e.clientY - g.startY;
    if (Math.abs(dx) + Math.abs(dy) > 5) g.moved = true;
    if (!g.id) {
      setView({ ...g.view, x: g.view.x + dx, y: g.view.y + dy });
      return;
    }
    // While dragging, keep the card on the board; it snaps into a box on drop.
    const x = Math.max(
        QUAD.x[0],
        Math.min(
          QUAD.x[1] + QUAD.w - CARD.w,
          g.task.x + dx / viewRef.current.scale,
        ),
      ),
      y = Math.max(
        QUAD.y[0],
        Math.min(
          QUAD.y[1] + QUAD.h - CARD.h,
          g.task.y + dy / viewRef.current.scale,
        ),
      );
    setTasks((prev) => prev.map((t) => (t.id === g.id ? { ...t, x, y } : t)));
    setOver(quadrantAt(x, y));
  }
  async function end() {
    const g = gesture.current;
    gesture.current = null;
    setDragging(null);
    setOver(null);
    if (!g?.id) return;
    if (!g.moved) {
      openTask(g.task);
      return;
    }
    const moved = tasksRef.current.find((t) => t.id === g.id)!;
    const q = quadrantAt(moved.x, moved.y);
    const { x, y } = snapTo(q, moved.x, moved.y);
    try {
      await persist({ ...moved, x, y, q });
    } catch (e) {
      setTasks((prev) => prev.map((t) => (t.id === g.id ? g.task : t)));
      setError((e as Error).message);
    }
  }
  function add(quadrant?: number) {
    const draft = drafts[NEW_DRAFT];
    // A specific quadrant (1-4 or its + button) moves a waiting draft there.
    if (draft) return setEdit({ ...draft, q: quadrant ?? draft.q });
    const q = quadrant ?? 0;
    setEdit({
      id: newId(),
      title: "",
      notes: "",
      q,
      ...positionFor(q, tasks.filter((t) => t.q === q && !t.done).length),
      done: false,
      due: "",
      sources: [],
      links: [],
    });
  }
  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!edit || !edit.title.trim()) return;
    const saved = tasks.find((t) => t.id === edit.id),
      isNew = !saved;
    // Picking a different quadrant in the editor moves the card to that quadrant's next free slot.
    const place =
      !saved || saved.q !== edit.q
        ? positionFor(
            edit.q,
            tasks.filter((t) => t.q === edit.q && !t.done && t.id !== edit.id)
              .length,
          )
        : {};
    setBusy(true);
    try {
      await persist({
        ...edit,
        ...place,
        title: edit.title.trim(),
        sources: cleanLinks(edit.sources),
        links: cleanLinks(edit.links),
        ...(isNew ? { created_at: new Date().toISOString() } : {}),
      });
      setDraft(isNew ? NEW_DRAFT : edit.id, null);
      setEdit(null);
      setError("");
      if (isNew && !prefersReducedMotion()) {
        setSprouting((s) => [...s, edit.id]);
        setTimeout(
          () => setSprouting((s) => s.filter((id) => id !== edit.id)),
          1500,
        );
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  /** Check fills, confetti bursts, then the card flies into the Completed counter. */
  async function complete(t: Task) {
    if (animating(t.id)) return;
    const el = cardEls.current.get(t.id),
      target = completedBtn.current;
    // The server stamps done_at too; setting it here keeps the done list current without a reload.
    const done = { ...t, done: true, done_at: new Date().toISOString() };
    if (prefersReducedMotion() || !el || !target) return change(done);
    setCompleting((c) => [...c, t.id]);
    await wait(1050);
    const from = el.getBoundingClientRect(),
      to = target.getBoundingClientRect(),
      scale = viewRef.current.scale;
    const dx = (to.left + to.width / 2 - (from.left + from.width / 2)) / scale,
      dy = (to.top + to.height / 2 - (from.top + from.height / 2)) / scale;
    const fly = el.animate(
      [
        { transform: "none", opacity: 1 },
        { transform: `translate(${dx}px, ${dy}px) scale(0.12)`, opacity: 0 },
      ],
      { duration: 520, easing: "cubic-bezier(.5,0,.8,.6)", fill: "forwards" },
    );
    await fly.finished;
    try {
      await persist(done);
      setBump(true);
      setTimeout(() => setBump(false), 650);
    } catch (e) {
      fly.cancel();
      setError((e as Error).message);
    } finally {
      setCompleting((c) => c.filter((id) => id !== t.id));
    }
  }
  /** After confirmation: the card crumples into a paper ball and lands in a bin. */
  async function toss(t: Task) {
    setConfirmToss(null);
    const el = cardEls.current.get(t.id);
    if (prefersReducedMotion() || !el) {
      try {
        await persist(t, true);
      } catch (e) {
        setError((e as Error).message);
      }
      return;
    }
    setTossing((s) => [...s, t.id]);
    // The bin sits just past the card's bottom-right corner (see .toss-bin).
    const dx = el.offsetWidth / 2 + 44,
      dy = el.offsetHeight / 2 - 10;
    // Past the squish the card itself fades out and <PaperBall> (a child, so it
    // inherits the flight) takes over.
    const gone = {
      background: "transparent",
      borderColor: "transparent",
      boxShadow: "none",
    };
    const crumple = el.animate(
      [
        { offset: 0, transform: "none", borderRadius: "9px" },
        { offset: 0.15, transform: "rotate(-3deg) scale(1.03)" },
        {
          offset: 0.4,
          transform: "scale(.62,.5) rotate(12deg)",
          borderRadius: "40px",
        },
        {
          offset: 0.56,
          transform: "scale(.24) rotate(40deg)",
          borderRadius: "50%",
          ...gone,
        },
        {
          offset: 0.72,
          transform: `translate(${dx * 0.5}px, -90px) scale(.2) rotate(160deg)`,
          borderRadius: "50%",
          ...gone,
        },
        {
          offset: 0.9,
          transform: `translate(${dx}px, ${dy - 24}px) scale(.16) rotate(300deg)`,
          borderRadius: "50%",
          ...gone,
          opacity: 1,
        },
        {
          offset: 1,
          transform: `translate(${dx}px, ${dy}px) scale(.1) rotate(330deg)`,
          borderRadius: "50%",
          ...gone,
          opacity: 0,
        },
      ],
      { duration: 1250, easing: "cubic-bezier(.45,0,.55,1)", fill: "forwards" },
    );
    await crumple.finished;
    // Let the bin drop back into the floor before the card is removed.
    await wait(750);
    try {
      await persist(t, true);
    } catch (e) {
      crumple.cancel();
      setError((e as Error).message);
    } finally {
      setTossing((s) => s.filter((id) => id !== t.id));
    }
  }
  /** Restart a task's hourglass once it has run out. */
  function flip(t: Task) {
    void change({ ...t, aged_from: new Date().toISOString() });
  }
  /** Single-key shortcuts. Any ⌘/Ctrl/Alt combo is left to the browser (⌘T, ⌘N, …). */
  const shortcut = useRef<(e: KeyboardEvent) => void>(() => {});
  shortcut.current = (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;
    // Any open dialog, including ones whose state lives elsewhere (update.tsx).
    if (document.querySelector('[role="dialog"][data-state="open"]')) return;
    const focused = (document.activeElement as HTMLElement | null)?.closest(
      "[data-task-id]",
    ) as HTMLElement | null;
    const id = focused?.dataset.taskId ?? hovered.current;
    const card = tasks.find((t) => t.id === id && !t.done && !animating(t.id));
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    let run: (() => void) | null = null;
    if (key === "+" || key === "=") run = () => zoom(1.25);
    else if (key === "-" || key === "_") run = () => zoom(0.8);
    else if (e.repeat) return;
    else if (key === "?") run = () => setHelp(true);
    else if (key === "0") run = fit;
    else if (/^[1-4]$/.test(key) && ready) run = () => add(+key - 1);
    else if (key === "n" && ready) run = () => add();
    else if (key === "c") run = () => setCompleted(true);
    else if (key === "v") run = () => setMode("select");
    else if (key === "h") run = () => setMode("hand");
    else if (key === "Escape" && focused) run = () => focused.blur();
    else if (card && ready) {
      if (key === "e") run = () => openTask(card);
      else if (key === "x") run = () => void complete(card);
      else if (key === "Backspace" || key === "Delete")
        run = () => setConfirmToss(card);
    }
    if (!run) return;
    // Also keeps the key from being typed into a dialog that opens on it.
    e.preventDefault();
    run();
  };
  useEffect(() => {
    const keys = (e: KeyboardEvent) => shortcut.current(e);
    window.addEventListener("keydown", keys);
    return () => window.removeEventListener("keydown", keys);
  }, []);
  const actionsRef = useRef({ persist, ready });
  actionsRef.current = { persist, ready };
  useEffect(() => {
    const context = (document as any).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const register = (tool: any) => {
      try {
        Promise.resolve(
          context.registerTool(tool, { signal: lifecycle.signal }),
        ).catch(() => {});
      } catch {}
    };
    register({
      name: "list_board_tasks",
      description: "Read tasks and their Eisenhower quadrants.",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute: () => ({ tasks: tasksRef.current }),
    });
    register({
      name: "move_board_task",
      description:
        "Move an existing task to an Eisenhower quadrant and save its position.",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string" },
          quadrant: { type: "integer", minimum: 0, maximum: 3 },
        },
        required: ["id", "quadrant"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: true },
      execute: async (input: any) => {
        if (
          !input ||
          typeof input.id !== "string" ||
          !Number.isInteger(input.quadrant) ||
          input.quadrant < 0 ||
          input.quadrant > 3
        )
          throw Error("A task ID and quadrant from 0 to 3 are required.");
        const t = tasksRef.current.find((t) => t.id === input.id);
        if (!t) throw Error("Task not found");
        if (!actionsRef.current.ready) throw Error("Board is not loaded");
        const q = input.quadrant;
        await actionsRef.current.persist({
          ...t,
          q,
          ...positionFor(
            q,
            tasksRef.current.filter(
              (a) => a.q === q && !a.done && a.id !== t.id,
            ).length,
          ),
        });
        return { id: t.id, quadrant: q };
      },
    });
    return () => lifecycle.abort();
  }, []);
  useEffect(() => {
    const el = viewport.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const px = e.clientX - rect.left,
        py = e.clientY - rect.top;
      const delta =
        e.deltaY *
        (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? rect.height : 1);
      setView((v) => {
        const scale = Math.max(
          0.25,
          Math.min(1.6, v.scale * Math.exp(-delta * 0.002)),
        );
        return {
          scale,
          x: px - ((px - v.x) * scale) / v.scale,
          y: py - ((py - v.y) * scale) / v.scale,
        };
      });
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  }, []);
  const count = tasks.filter((t) => t.done).length;
  return (
    <main className="app">
      <FlameDefs />
      <header className="topbar">
        <div className="brand">
          <img src="/favicon.svg" alt="" width={34} height={34} />
          <div>
            <h1>Focus</h1>
          </div>
        </div>
        <div className="task-count" aria-live="polite">
          {tasks.filter((t) => !t.done).length} tasks
        </div>
        <div className="header-actions">
          <UpdateButton />
          <button
            ref={completedBtn}
            className="plain"
            title="Completed (C)"
            aria-keyshortcuts="C"
            onClick={() => setCompleted(true)}
          >
            <Check size={17} />
            <span>Completed</span>
            <b className={bump ? "bump" : ""}>{count}</b>
          </button>
          <button
            className="primary"
            disabled={!ready}
            title={drafts[NEW_DRAFT] ? "Resume your draft (N)" : "Add task (N)"}
            aria-keyshortcuts="N"
            onClick={() => add()}
          >
            <Plus size={18} /> {drafts[NEW_DRAFT] ? "Resume draft" : "Add task"}
          </button>
        </div>
      </header>
      {error && (
        <div className="error" role="alert">
          {error}
          {!ready && <button onClick={load}>Retry</button>}
          <button aria-label="Dismiss error" onClick={() => setError("")}>
            <X size={16} />
          </button>
        </div>
      )}
      <div
        ref={viewport}
        className={"viewport " + (mode === "hand" ? "pan-mode" : "")}
        onPointerDown={(e) => start(e)}
        onAuxClick={(e) => {
          if (e.button === 1) e.preventDefault();
        }}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={() => {
          const g = gesture.current;
          if (g?.id)
            setTasks((p) => p.map((t) => (t.id === g.id ? g.task : t)));
          gesture.current = null;
          setDragging(null);
          setOver(null);
        }}
      >
        <div
          className="canvas"
          style={{
            transform: `translate(${view.x}px,${view.y}px) scale(${view.scale})`,
          }}
        >
          <div className="column-label urgent">URGENT</div>
          <div className="column-label later">NOT URGENT</div>
          <div className="row-label important">IMPORTANT</div>
          <div className="row-label less-important">LESS IMPORTANT</div>
          {quadrants.map((q, i) => (
            <section
              key={q.name}
              className={`quadrant q${i} ${over === i ? "drop-active" : ""}`}
              style={{ left: QUAD.x[i % 2], top: QUAD.y[i >= 2 ? 1 : 0] }}
            >
              <div className="quad-heading">
                <button
                  aria-label={`Add task to ${q.name}`}
                  title={`Add task here (${i + 1})`}
                  aria-keyshortcuts={String(i + 1)}
                  disabled={!ready}
                  onClick={() => add(i)}
                >
                  <Plus size={21} />
                </button>
              </div>
            </section>
          ))}
          {tasks
            .filter((t) => !t.done)
            .map((t) => {
              const due = dueInfo(t.due, now),
                age = ageInfo(t, now),
                timeUp = !due && age.fraction >= 1;
              const fx = sprouting.includes(t.id)
                ? "sprouting"
                : completing.includes(t.id)
                  ? "completing"
                  : tossing.includes(t.id)
                    ? "tossing"
                    : "";
              return (
                <article
                  key={t.id}
                  ref={(el) => {
                    if (el) cardEls.current.set(t.id, el);
                    else cardEls.current.delete(t.id);
                  }}
                  className={`task-card card-q${t.q} ${dragging === t.id ? "dragging" : ""} ${due ? HEAT_CLASS[due.heat] : ""} ${fx}`}
                  style={{
                    left: t.x,
                    top: t.y,
                    zIndex: dragging === t.id ? 20 : 2,
                  }}
                  data-task-id={t.id}
                  onPointerEnter={() => (hovered.current = t.id)}
                  onPointerLeave={() => {
                    if (hovered.current === t.id) hovered.current = null;
                  }}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    start(e, t);
                  }}
                  tabIndex={0}
                  aria-label={`${t.title}. ${quadrants[t.q].name}. Press Enter or E to edit, X to complete, Delete to remove. Alt plus arrow keys moves between quadrants.`}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") openTask(t);
                    if (
                      e.altKey &&
                      [
                        "ArrowLeft",
                        "ArrowRight",
                        "ArrowUp",
                        "ArrowDown",
                      ].includes(e.key)
                    ) {
                      e.preventDefault();
                      const col = t.q % 2,
                        row = Math.floor(t.q / 2);
                      const q =
                        e.key === "ArrowLeft"
                          ? row * 2
                          : e.key === "ArrowRight"
                            ? row * 2 + 1
                            : e.key === "ArrowUp"
                              ? col
                              : col + 2;
                      void change({
                        ...t,
                        q,
                        ...positionFor(
                          q,
                          tasks.filter(
                            (a) => a.q === q && !a.done && a.id !== t.id,
                          ).length,
                        ),
                      });
                    }
                  }}
                >
                  <div className="card-top">
                    <div className="chips">
                      {drafts[t.id] && (
                        <span
                          className="chip chip-draft"
                          title="Has unsaved edits. Open it to pick up where you left off."
                        >
                          Draft
                        </span>
                      )}
                      {timeUp ? (
                        <button
                          type="button"
                          className="chip chip-age time-up"
                          title="Restart this task's hourglass"
                          onClick={() => flip(t)}
                        >
                          <Hourglass fraction={1} />
                          time is up · flip it?
                        </button>
                      ) : (
                        age.visible && (
                          <span
                            className="chip chip-age"
                            title={`Created ${age.long.replace(" old", " ago")}`}
                          >
                            <Hourglass fraction={age.fraction} />
                            {due ? age.short : age.long}
                          </span>
                        )
                      )}
                      {due && (
                        <span
                          className={`chip chip-due due-${due.heat}`}
                          title={`Due ${t.due}`}
                        >
                          <CalendarIcon />
                          {due.text}
                        </span>
                      )}
                    </div>
                    <Grip size={16} />
                  </div>
                  {due?.heat === 4 && <Flame />}
                  <h4>{t.title}</h4>
                  {t.notes && <p>{t.notes}</p>}
                  <div className="card-bottom">
                    <span className="card-links">
                      {t.sources?.[0] && (
                        <a
                          href={t.sources[0].url}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={t.sources[0].url}
                        >
                          <Link2 size={13} />
                          {t.sources[0].label}
                        </a>
                      )}
                      {(t.sources?.length ?? 0) + (t.links?.length ?? 0) >
                        (t.sources?.[0] ? 1 : 0) && (
                        <em>
                          +
                          {(t.sources?.length ?? 0) +
                            (t.links?.length ?? 0) -
                            (t.sources?.[0] ? 1 : 0)}
                        </em>
                      )}
                    </span>
                    <span className="card-actions">
                      <button
                        className="card-trash"
                        aria-label={`Delete ${t.title}`}
                        title="Delete (⌫)"
                        onClick={() => setConfirmToss(t)}
                      >
                        <Trash2 size={14} />
                      </button>
                      <button
                        className="card-check"
                        aria-label={`Complete ${t.title}`}
                        title="Complete (X)"
                        onClick={() => complete(t)}
                      >
                        <Check size={15} />
                      </button>
                    </span>
                  </div>
                  {fx === "tossing" && <PaperBall />}
                  {fx === "completing" &&
                    CONFETTI.map((c, i) => (
                      <span
                        key={i}
                        className="confetti"
                        style={
                          {
                            background: c.color,
                            width: c.w,
                            height: c.h,
                            borderRadius: c.round ? "50%" : 2,
                            animationDelay: `${0.45 + c.delay}s`,
                            "--dx": `${c.dx}px`,
                            "--dy": `${c.dy}px`,
                            "--r": `${c.rot}deg`,
                          } as React.CSSProperties
                        }
                      />
                    ))}
                </article>
              );
            })}
          {/* Effects that sit beside a card rather than inside it. */}
          {tasks
            .filter((t) => sprouting.includes(t.id) || tossing.includes(t.id))
            .map((t) =>
              sprouting.includes(t.id) ? (
                <div
                  key={`fx-${t.id}`}
                  className="sprout-fx"
                  style={{ left: t.x, top: t.y }}
                  aria-hidden="true"
                >
                  <Sprout />
                  <span className="spark s1">
                    <Sparkle color="#2fbf8f" />
                  </span>
                  <span className="spark s2">
                    <Sparkle color="#f5bf45" />
                  </span>
                  <span className="spark s3">
                    <Sparkle color="#2fbf8f" />
                  </span>
                </div>
              ) : (
                <div
                  key={`fx-${t.id}`}
                  className="toss-bin"
                  style={{ left: t.x, top: t.y }}
                  aria-hidden="true"
                >
                  <span className="bin-hole" />
                  <div className="bin-well">
                    <div className="bin-rise">
                      <Bin />
                    </div>
                  </div>
                </div>
              ),
            )}
        </div>
      </div>
      <footer>
        <UpdatedToast />
        <div className="toolbox" ref={toolbox}>
          <button
            className={mode === "select" ? "active" : ""}
            aria-label="Select and move cards"
            title="Select (V)"
            aria-keyshortcuts="V"
            onClick={() => setMode("select")}
          >
            <MousePointer2 size={19} />
          </button>
          <button
            className={mode === "hand" ? "active" : ""}
            aria-label="Pan canvas"
            title="Hand (H)"
            aria-keyshortcuts="H"
            onClick={() => setMode("hand")}
          >
            <Hand size={19} />
          </button>
          <i />
          <button
            aria-label="Zoom out"
            title="Zoom out (−)"
            aria-keyshortcuts="-"
            onClick={() => zoom(0.8)}
          >
            <Minus size={17} />
          </button>
          <span>{Math.round(view.scale * 100)}%</span>
          <button
            aria-label="Zoom in"
            title="Zoom in (+)"
            aria-keyshortcuts="+"
            onClick={() => zoom(1.25)}
          >
            <Plus size={17} />
          </button>
          <i />
          <button
            className="reset-view"
            aria-label="Reset view"
            title="Reset view (0)"
            aria-keyshortcuts="0"
            onClick={fit}
          >
            <Maximize size={18} />
            <span>Reset view</span>
          </button>
          <i />
          <button
            aria-label="Keyboard shortcuts"
            title="Keyboard shortcuts (?)"
            aria-keyshortcuts="Shift+?"
            onClick={() => setHelp(true)}
          >
            <Keyboard size={18} />
          </button>
        </div>
      </footer>
      <Dialog
        open={!!edit}
        onOpenChange={(o) => {
          if (!o && !busy) setEdit(null);
        }}
      >
        <DialogContent
          className="editor gap-0 overflow-hidden p-0 sm:max-w-[580px]"
          aria-describedby={undefined}
          showCloseButton={false}
        >
          {edit &&
            (() => {
              const saved = tasks.find((t) => t.id === edit.id);
              const age = saved ? ageInfo(saved, now) : null;
              const dirty = saved ? !sameEdits(edit, saved) : !isBlank(edit);
              return (
                <form
                  onSubmit={saveEdit}
                  onKeyDown={(e) => {
                    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                      e.preventDefault();
                      e.currentTarget.requestSubmit();
                    }
                    // ⌥1-4 picks the quadrant, even mid-typing. Match the
                    // physical key: on a Mac, ⌥1 types "¡" rather than "1".
                    const digit = /^Digit([1-4])$/.exec(e.code);
                    if (e.altKey && !e.metaKey && !e.ctrlKey && digit) {
                      e.preventDefault();
                      setEdit({ ...edit, q: +digit[1] - 1 });
                    }
                  }}
                >
                  <div className={`editor-band band-q${edit.q}`}>
                    <div
                      className="quad-picker"
                      role="radiogroup"
                      aria-label="Quadrant"
                    >
                      {quadrants.map((q, i) => (
                        <button
                          key={q.name}
                          type="button"
                          role="radio"
                          aria-checked={edit.q === i}
                          className={`qp qp-${i} ${edit.q === i ? "on" : ""}`}
                          title={`${q.name} (⌥${digitKeys[i]})`}
                          aria-keyshortcuts={`Alt+${i + 1}`}
                          onClick={() => setEdit({ ...edit, q: i })}
                        >
                          <i />
                          {q.name}
                        </button>
                      ))}
                    </div>
                    <button
                      type="button"
                      className="editor-close"
                      aria-label="Close"
                      disabled={busy}
                      onClick={() => setEdit(null)}
                    >
                      <X size={18} />
                    </button>
                  </div>
                  <div className="editor-body">
                    <DialogTitle className="sr-only">
                      {saved ? "Edit task" : "New task"}
                    </DialogTitle>
                    <input
                      className="editor-title"
                      aria-label="Task title"
                      autoFocus
                      required
                      maxLength={160}
                      value={edit.title}
                      onChange={(e) =>
                        setEdit({ ...edit, title: e.target.value })
                      }
                      placeholder="What needs doing?"
                    />
                    <p className="editor-hint">{quadrants[edit.q].hint}</p>
                    <textarea
                      className="editor-notes"
                      aria-label="Task notes"
                      maxLength={2000}
                      value={edit.notes}
                      onChange={(e) =>
                        setEdit({ ...edit, notes: e.target.value })
                      }
                      placeholder="Add a note, a plan, a pep talk…"
                    />
                    <div className="editor-field">
                      <span className="field-label">
                        <CalendarIcon /> Due
                      </span>
                      <div className="due-picker">
                        <input
                          type="date"
                          aria-label="Due date"
                          value={edit.due}
                          onChange={(e) =>
                            setEdit({ ...edit, due: e.target.value })
                          }
                        />
                        {[
                          ["Today", 0],
                          ["Tomorrow", 1],
                          ["Next week", 7],
                        ].map(([label, offset]) => (
                          <button
                            key={label}
                            type="button"
                            className={
                              edit.due === isoDay(offset as number, now)
                                ? "on"
                                : ""
                            }
                            onClick={() =>
                              setEdit({
                                ...edit,
                                due: isoDay(offset as number, now),
                              })
                            }
                          >
                            {label}
                          </button>
                        ))}
                        {edit.due && (
                          <button
                            type="button"
                            className="clear"
                            aria-label="Clear due date"
                            onClick={() => setEdit({ ...edit, due: "" })}
                          >
                            <X size={13} />
                          </button>
                        )}
                      </div>
                    </div>
                    <LinkEditor
                      title="Sources"
                      items={edit.sources}
                      onChange={(sources) => setEdit({ ...edit, sources })}
                    />
                    <LinkEditor
                      title="Links"
                      items={edit.links}
                      onChange={(links) => setEdit({ ...edit, links })}
                    />
                    {error && (
                      <p role="alert" className="form-error">
                        {error}
                      </p>
                    )}
                  </div>
                  <div className="editor-foot">
                    {saved ? (
                      <button
                        type="button"
                        className="editor-toss"
                        disabled={busy}
                        onClick={() => {
                          setEdit(null);
                          setConfirmToss(saved);
                        }}
                      >
                        <Trash2 size={15} /> Toss
                      </button>
                    ) : null}
                    {age && (
                      <span className="editor-age">
                        <Hourglass fraction={age.fraction} />
                        {age.days < 1
                          ? "Created today"
                          : `Created ${age.long.replace(" old", " ago")}`}
                      </span>
                    )}
                    <span className="editor-spacer" />
                    {dirty && (
                      <span
                        className="editor-draft"
                        title="Close any time; your changes wait here until you save or discard them."
                      >
                        <i aria-hidden="true" />
                        Draft kept
                      </span>
                    )}
                    <button
                      type="button"
                      className="editor-cancel"
                      disabled={busy}
                      onClick={() => {
                        if (dirty) setDraft(saved ? edit.id : NEW_DRAFT, null);
                        setEdit(null);
                      }}
                    >
                      {dirty ? "Discard" : "Cancel"}
                    </button>
                    <button
                      type="submit"
                      className="primary"
                      disabled={busy || !edit.title.trim()}
                      title="Save (⌘ Enter)"
                    >
                      {busy ? "Saving…" : saved ? "Done" : "Add task"}
                    </button>
                  </div>
                </form>
              );
            })()}
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!confirmToss}
        onOpenChange={(o) => {
          if (!o) setConfirmToss(null);
        }}
      >
        <DialogContent className="toss-dialog" showCloseButton={false}>
          <div className="toss-icon" aria-hidden="true">
            <Trash2 size={20} />
          </div>
          <DialogTitle>Toss this task?</DialogTitle>
          <DialogDescription>
            “{confirmToss?.title}” gets crumpled up and thrown away. This can’t
            be undone.
          </DialogDescription>
          <div className="toss-actions">
            <button
              type="button"
              className="keep"
              autoFocus
              onClick={() => setConfirmToss(null)}
            >
              Keep it
            </button>
            <button
              type="button"
              className="toss"
              onClick={() => confirmToss && toss(confirmToss)}
            >
              Toss it
            </button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={help} onOpenChange={setHelp}>
        <DialogContent className="keys-dialog">
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>
            Single keys work anywhere except while you’re typing.
          </DialogDescription>
          <div className="keys-grid">
            {SHORTCUTS.map((g) => (
              <section key={g.title}>
                <h3>{g.title}</h3>
                <dl>
                  {g.keys.map(([keys, label]) => (
                    <div key={label}>
                      <dt>{label}</dt>
                      <dd>
                        {keys
                          .flatMap((k) =>
                            k !== QUAD_KEYS
                              ? [k]
                              : digitKeys.join("") === "1234"
                                ? ["1–4"]
                                : digitKeys,
                          )
                          .map((k) => (
                            <kbd key={k}>{k}</kbd>
                          ))}
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>
            ))}
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={completed} onOpenChange={setCompleted}>
        <DialogContent className="done-dialog">
          <div className="done-head">
            <DoneBadge />
            <div>
              <DialogTitle>Done &amp; dusted</DialogTitle>
              <DialogDescription>
                {count === 0
                  ? "Nothing crossed off yet."
                  : count === 1
                    ? "1 thing off your plate."
                    : `${count} things off your plate.`}
              </DialogDescription>
            </div>
          </div>
          {count > 0 && (
            <div className="done-tally">
              {quadrants.map((q, i) => {
                const n = tasks.filter((t) => t.done && t.q === i).length;
                return (
                  n > 0 && (
                    <span key={q.name} className={`tally tally-q${i}`}>
                      <i />
                      {q.name} <b>{n}</b>
                    </span>
                  )
                );
              })}
            </div>
          )}
          {count === 0 ? (
            <div className="done-empty">
              <EmptyDone />
              <p>Your first win lands here, with a little confetti.</p>
            </div>
          ) : (
            <div className="completed-list">
              {groupDone(
                tasks.filter((t) => t.done),
                now,
              ).map((g) => (
                <section key={g.label}>
                  <h3>{g.label}</h3>
                  {g.items.map((t, i) => (
                    <div
                      key={t.id}
                      className={`done-item ${openDone === t.id ? "open" : ""}`}
                      style={{ animationDelay: `${Math.min(i, 8) * 35}ms` }}
                    >
                      <div className="done-row">
                        <button
                          type="button"
                          className="done-toggle"
                          aria-expanded={openDone === t.id}
                          aria-controls={`done-card-${t.id}`}
                          onClick={() =>
                            setOpenDone((o) => (o === t.id ? null : t.id))
                          }
                        >
                          <span className="done-check" aria-hidden="true">
                            <Check size={13} strokeWidth={3} />
                          </span>
                          <span className="done-text">
                            <span className="done-title">{t.title}</span>
                            <span className="done-meta">
                              <i className={`dot dot-q${t.q}`} />
                              {quadrants[t.q].name}
                              {t.done_at && <> · {whenDone(t.done_at, now)}</>}
                            </span>
                          </span>
                          <ChevronDown
                            size={16}
                            className="done-chevron"
                            aria-hidden="true"
                          />
                        </button>
                        <button
                          className="put-back"
                          aria-label={`Put ${t.title} back on the board`}
                          onClick={async () => {
                            await change({ ...t, done: false, done_at: "" });
                            if (!prefersReducedMotion()) {
                              setSprouting((s) => [...s, t.id]);
                              setTimeout(
                                () =>
                                  setSprouting((s) =>
                                    s.filter((id) => id !== t.id),
                                  ),
                                1500,
                              );
                            }
                          }}
                        >
                          <RotateCcw size={14} />
                          Put back
                        </button>
                      </div>
                      {openDone === t.id && (
                        <DoneCard task={t} id={`done-card-${t.id}`} />
                      )}
                    </div>
                  ))}
                </section>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </main>
  );
}
