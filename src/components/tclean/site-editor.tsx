import { useEffect, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { saveSiteSetting, permanentlyDeleteHidden, saveSiteColors, setRouletteEnabled } from "@/lib/business.functions";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { businessQuery } from "@/lib/business-query";
import { elementColorKey } from "@/lib/site-colors";
import { hideKey } from "@/lib/editor-history";
import {
  Settings,
  Smartphone,
  Tablet,
  Monitor,
  RotateCw,
  X,
  Trash2,
  Type,
  Palette, // <-- Ajouté
  Copy,
  Check,
  FileCode,
  ArrowRight,
  Sun,
  Moon,
  Wifi,
  Battery,
  Minus,
  ClipboardList,
  Undo2,
  Dices,
} from "lucide-react";

type DeviceView = "desktop" | "tablet" | "mobile";
type EditMode = "none" | "text" | "delete" | "color"; // <-- Ajout de "color"

export type EditorLog = {
  id: string;
  type: "delete" | "modify";
  file: string;
  description: string;
  page: string;
  label: string;
  originalCode: string;
  newCode?: string;
  key: string;
  date: string;
};

const LOGS_STORAGE_KEY = "tclean_admin_editor_logs";

function loadLogs(): EditorLog[] {
  try {
    const raw = localStorage.getItem(LOGS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveLogs(logs: EditorLog[]) {
  try {
    localStorage.setItem(LOGS_STORAGE_KEY, JSON.stringify(logs));
  } catch {
    // Ignore storage errors
  }
}

// 1. Détection ultra-précise de l'élément cliquable (feuille de texte uniquement)
function getPreciseTarget(target: HTMLElement): HTMLElement | null {
  const editorSelector =
    ".tc-site-editor-phone, .tc-editor-gear-btn, .tc-device-simulator-overlay, .tc-editor-modal, .tc-logs-modal, .tc-laser-visor";
  if (target.closest(editorSelector)) return null;

  // Images
  if (target instanceof HTMLImageElement) return target;

  // Boutons ou liens entiers
  const btnOrLink = target.closest("a, button");
  if (btnOrLink && !btnOrLink.closest(editorSelector)) {
    return btnOrLink as HTMLElement;
  }

  // Éléments de texte feuille stricts
  const leafSelectors = "h1, h2, h3, h4, h5, h6, p, li, blockquote, label, span.eyebrow, span.badge";
  const closestLeaf = target.closest(leafSelectors) as HTMLElement | null;
  if (closestLeaf && !closestLeaf.closest(editorSelector)) {
    return closestLeaf;
  }

  // Si c'est un span avec du texte direct
  if (target.tagName.toLowerCase() === "span" && (target.textContent ?? "").trim()) {
    return target;
  }

  // Si l'élément ciblé n'a pas d'enfants (feuille pure) et a du texte direct
  const tag = target.tagName.toLowerCase();
  const forbiddenContainers = [
    "section",
    "article",
    "header",
    "footer",
    "nav",
    "aside",
    "main",
    "body",
    "html",
    "form",
    "div",
  ];
  if (!forbiddenContainers.includes(tag) && target.children.length === 0 && (target.textContent ?? "").trim()) {
    return target;
  }

  return null;
}

// 2. Détection du fichier source TSX
function detectSourceFile(el: HTMLElement, pathname: string): { file: string; description: string } {
  if (el.closest("header, .site-header, footer, .site-footer")) {
    return { file: "src/components/tclean/site-shell.tsx", description: "En-tête ou pied de page du site" };
  }
  if (pathname === "/") {
    return { file: "src/components/tclean/home.tsx", description: "Page d'accueil" };
  }
  if (pathname === "/configurateur") {
    return { file: "src/components/tclean/configurator.tsx", description: "Configurateur / Estimation" };
  }
  if (pathname === "/contact") {
    if (el.closest(".contact-inbox, [data-inbox], form")) {
      return { file: "src/components/tclean/contact-inbox.tsx", description: "Messagerie client & formulaires" };
    }
    return {
      file: "src/components/tclean/public-pages.tsx",
      description: "Page Contact (En-tête PageHeading ou contenu)",
    };
  }
  if (
    ["/tarifs", "/devis", "/a-propos", "/avis", "/faq", "/zone-intervention", "/sav", "/realisations"].includes(
      pathname,
    )
  ) {
    return { file: "src/components/tclean/public-pages.tsx", description: `Page ${pathname}` };
  }
  return { file: `src/routes${pathname === "/" ? "/index" : pathname}.tsx`, description: "Page du site" };
}

export function SiteEditor() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [deviceView, setDeviceView] = useState<DeviceView>("desktop");
  const [nativeView, setNativeView] = useState<DeviceView>("desktop");
  const [editMode, setEditMode] = useState<EditMode>("none");
  const [darkMode, setDarkMode] = useState(false);
  const [timeStr, setTimeStr] = useState("12:00");

  // Journal des logs
  const [logs, setLogs] = useState<EditorLog[]>([]);
  const [showLogsModal, setShowLogsModal] = useState(false);
  const [selectedLog, setSelectedLog] = useState<EditorLog | null>(null);
  const [logFilter, setLogFilter] = useState<"all" | "delete" | "modify">("all");
  const [undoing, setUndoing] = useState(false);
  const saveColors = useServerFn(saveSiteColors);

  // État d'édition couleur au clic
  const [pendingColorEdit, setPendingColorEdit] = useState<{
    key: string;
    tagName: string;
    label: string;
    color: string;
    bgColor: string;
    borderColor: string;
  } | null>(null);
  // État du viseur laser au survol
  const [hoveredRect, setHoveredRect] = useState<{
    top: number;
    left: number;
    width: number;
    height: number;
    tag: string;
    preview: string;
  } | null>(null);

  // Édition en direct au clic
  const [pendingTextEdit, setPendingTextEdit] = useState<{
    key: string;
    label: string;
    file: string;
    description: string;
    original: string;
    currentValue: string;
  } | null>(null);

  const [copiedType, setCopiedType] = useState<string | null>(null);

  const save = useServerFn(saveSiteSetting);
  const queryClient = useQueryClient();
  const { data: siteConfig } = useQuery(businessQuery);
  const toggleRouletteFn = useServerFn(setRouletteEnabled);
  const [rouletteToggling, setRouletteToggling] = useState(false);
  const isRouletteActive = siteConfig?.rouletteEnabled !== false;
  const permDelete = useServerFn(permanentlyDeleteHidden);

  const pathname = useRouterState({
    select: (s) => s.location.pathname,
  });

  useEffect(() => {
    setLogs(loadLogs());
  }, []);

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTimeStr(now.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }));
    };
    updateTime();
    const interval = setInterval(updateTime, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const isDark =
      document.documentElement.classList.contains("tclean-dark-mode") ||
      localStorage.getItem("tclean-dark-mode") === "true";
    setDarkMode(isDark);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const checkRole = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          if (!cancelled) setIsAdmin(false);
          return;
        }
        const { data: hasRole } = await supabase.rpc("has_role", {
          _user_id: user.id,
          _role: "admin",
        });
        if (!cancelled) setIsAdmin(Boolean(hasRole));
      } catch {
        if (!cancelled) setIsAdmin(false);
      }
    };
    void checkRole();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      void checkRole();
    });
    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  const toggleDarkMode = () => {
    const next = !darkMode;
    setDarkMode(next);
    if (next) {
      document.documentElement.classList.add("tclean-dark-mode");
      localStorage.setItem("tclean-dark-mode", "true");
    } else {
      document.documentElement.classList.remove("tclean-dark-mode");
      localStorage.setItem("tclean-dark-mode", "false");
    }
  };

  // FONCTION CTRL+Z : ANNULER UNE ACTION ET REMETTRE COMME AVANT
  const handleUndo = async (log: EditorLog) => {
    if (undoing) return;
    setUndoing(true);
    try {
      if (log.type === "delete") {
        await save({
          data: {
            kind: "hide",
            key: log.key,
            value: null,
            audience: "all",
          },
        });
      } else {
        await save({
          data: {
            kind: "text",
            key: log.key,
            value: null,
            audience: "all",
          },
        });
      }

      const updatedLogs = logs.filter((l) => l.id !== log.id);
      setLogs(updatedLogs);
      saveLogs(updatedLogs);
      setSelectedLog(null);

      toast.success(`Action annulée (Ctrl+Z) ! « ${log.label} » a été remis comme avant.`);
      setTimeout(() => {
        window.location.reload();
      }, 500);
    } catch (err) {
      toast.error((err as Error).message || "Erreur lors du rétablissement.");
      setUndoing(false);
    }
  };

  // Raccourci clavier physique Ctrl+Z
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !e.shiftKey) {
        if (logs.length > 0) {
          e.preventDefault();
          const lastLog = logs[0];
          if (lastLog) void handleUndo(lastLog);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [logs]);

  // Suivi de la souris pour le viseur laser en temps réel
  useEffect(() => {
    if (editMode === "none") {
      setHoveredRect(null);
      return;
    }

    const updateHover = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) {
        setHoveredRect(null);
        return;
      }
      const el = getPreciseTarget(target);
      if (!el) {
        setHoveredRect(null);
        return;
      }
      const rect = el.getBoundingClientRect();
      const text = (el.textContent ?? "").trim().replace(/\s+/g, " ");
      setHoveredRect({
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
        tag: el.tagName.toLowerCase(),
        preview: text.slice(0, 45) || el.getAttribute("aria-label") || el.tagName.toLowerCase(),
      });
    };

    const clearHover = () => setHoveredRect(null);

    window.addEventListener("mousemove", updateHover, { passive: true });
    window.addEventListener("scroll", clearHover, { passive: true });
    window.addEventListener("resize", clearHover, { passive: true });

    return () => {
      window.removeEventListener("mousemove", updateHover);
      window.removeEventListener("scroll", clearHover);
      window.removeEventListener("resize", clearHover);
    };
  }, [editMode]);

  // Action commune pour suppression ou modification (PC ou simulateur iPhone)
  const handleElementAction = (el: HTMLElement) => {
    const key = hideKey(el) ?? "";
    const text = (el.textContent ?? "").trim();
    const detected = detectSourceFile(el, pathname);
    const tag = el.tagName.toLowerCase();
    const label = text.slice(0, 50) || tag;

    let snippet = el.outerHTML;
    if (snippet.length > 400) snippet = snippet.slice(0, 400) + "...";

    // 1. SUPPRESSION
    if (editMode === "delete") {
      const confirmed = window.confirm(
        `Supprimer définitivement cet élément ?\n\n<${tag}> « ${label} »\nFichier source : ${detected.file}\n\n(Vous pourrez l'annuler à tout moment avec le bouton Ctrl+Z des logs)`,
      );
      if (!confirmed) return;

      void (async () => {
        try {
          await save({
            data: {
              kind: "hide",
              key,
              value: JSON.stringify({
                label: `<${tag}> ${label}`,
                page: pathname,
                at: new Date().toISOString(),
                audience: "all",
              }),
              audience: "all",
            },
          });
          await permDelete({ data: { key } });
          el.style.setProperty("display", "none", "important");

          const newLog: EditorLog = {
            id: crypto.randomUUID(),
            type: "delete",
            file: detected.file,
            description: detected.description,
            page: pathname,
            label: `<${tag}> ${label}`,
            originalCode: text || snippet,
            key,
            date: new Date().toLocaleString("fr-FR"),
          };
          const updated = [newLog, ...logs];
          setLogs(updated);
          saveLogs(updated);

          toast.success(`Élément <${tag}> supprimé. Enregistré dans le journal logs.`);
        } catch (err) {
          toast.error((err as Error).message || "Erreur de suppression.");
        }
      })();
      return;
    }
    // 3. COULEUR AU CLIC
    if (editMode === "color") {
      const colorKey = elementColorKey(el, pathname);
      if (!colorKey) {
        toast.error("Impossible de cibler cet élément précis pour la couleur.");
        return;
      }
      const computed = window.getComputedStyle(el);
      setPendingColorEdit({
        key: colorKey,
        tagName: tag,
        label: `<${tag}> ${label}`,
        color: "",
        bgColor: "",
        borderColor: "",
      });
      return;
    }
    // 2. MODIFICATION
    if (editMode === "text") {
      setPendingTextEdit({
        key,
        label: `<${tag}> ${label}`,
        file: detected.file,
        description: detected.description,
        original: text,
        currentValue: text,
      });
    }
  };

  // Clic sur l'écran principal (PC)
  useEffect(() => {
    if (editMode === "none") return;

    const editorSelector =
      ".tc-site-editor-phone, .tc-editor-gear-btn, .tc-device-simulator-overlay, .tc-editor-modal, .tc-logs-modal, .tc-laser-visor";

    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target || target.closest(editorSelector)) return;

      e.preventDefault();
      e.stopPropagation();

      const el = getPreciseTarget(target);
      if (!el) {
        toast.error("Visez directement un titre (h1-h6), un paragraphe (p), un bouton ou un texte précis.");
        return;
      }
      handleElementAction(el);
    };

    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, [editMode, pathname, logs, save, permDelete]);

  // Clic et laser DANS l'écran iPhone / iPad du simulateur
  useEffect(() => {
    if (deviceView === nativeView || editMode === "none") return;

    const iframe = document.querySelector(".tc-device-iframe") as HTMLIFrameElement | null;
    if (!iframe) return;

    const attachIframeListeners = (): (() => void) | undefined => {
      try {
        const doc = iframe.contentDocument;
        if (!doc) return undefined;

        const handleIframeClick = (e: MouseEvent) => {
          const target = e.target as HTMLElement | null;
          if (!target) return;

          e.preventDefault();
          e.stopPropagation();

          const el = getPreciseTarget(target);
          if (!el) {
            toast.error("Visez directement un titre, un paragraphe, un bouton ou un texte précis.");
            return;
          }
          handleElementAction(el);
        };

        const handleIframeMouseMove = (e: MouseEvent) => {
          const target = e.target as HTMLElement | null;
          if (!target) {
            setHoveredRect(null);
            return;
          }
          const el = getPreciseTarget(target);
          if (!el) {
            setHoveredRect(null);
            return;
          }
          const iframeRect = iframe.getBoundingClientRect();
          const elRect = el.getBoundingClientRect();
          const text = (el.textContent ?? "").trim().replace(/\s+/g, " ");
          setHoveredRect({
            top: iframeRect.top + elRect.top,
            left: iframeRect.left + elRect.left,
            width: elRect.width,
            height: elRect.height,
            tag: el.tagName.toLowerCase(),
            preview: text.slice(0, 45) || el.getAttribute("aria-label") || el.tagName.toLowerCase(),
          });
        };

        doc.addEventListener("click", handleIframeClick, true);
        doc.addEventListener("mousemove", handleIframeMouseMove, { passive: true });

        return () => {
          doc.removeEventListener("click", handleIframeClick, true);
          doc.removeEventListener("mousemove", handleIframeMouseMove);
        };
      } catch {
        return undefined;
      }
    };

    const cleanup = attachIframeListeners();
    iframe.addEventListener("load", attachIframeListeners);

    return () => {
      if (cleanup) cleanup();
      iframe.removeEventListener("load", attachIframeListeners);
    };
  }, [deviceView, nativeView, editMode, logs, pathname, save, permDelete]);
  const copyToClipboard = async (textToCopy: string, type: string) => {
    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopiedType(type);
      toast.success("Copié dans le presse-papier !");
      setTimeout(() => setCopiedType(null), 2500);
    } catch {
      toast.error("Impossible de copier automatiquement.");
    }
  };

  const isInsideSimulator = typeof window !== "undefined" && window.location.search.includes("simulator_preview=1");
  if (isInsideSimulator || !isAdmin) return null;

  const filteredLogs = logs.filter((log) => {
    if (logFilter === "delete") return log.type === "delete";
    if (logFilter === "modify") return log.type === "modify";
    return true;
  });

  return (
    <>
      {/* 1. Simulateur d'écran réel (Mobile / Tablette / PC) */}
      {deviceView !== nativeView && (
        <aside className="tc-device-simulator-overlay" aria-label="Aperçu écran réel">
          <div className="tc-simulator-topbar">
            <div className="tc-simulator-switcher">
              <button
                type="button"
                className={deviceView === "mobile" ? "active" : ""}
                onClick={() => setDeviceView("mobile")}
              >
                <Smartphone size={14} />
                <span>iPhone (390 px)</span>
              </button>
              <button
                type="button"
                className={deviceView === "tablet" ? "active" : ""}
                onClick={() => setDeviceView("tablet")}
              >
                <Tablet size={14} />
                <span>iPad (768 px)</span>
              </button>
              <button
                type="button"
                className={deviceView === "desktop" ? "active" : ""}
                onClick={() => setDeviceView("desktop")}
              >
                <Monitor size={14} />
                <span>PC (1280 px)</span>
              </button>
              <button type="button" onClick={() => setDeviceView(nativeView)}>
                <span>Quitter l'aperçu</span>
              </button>
            </div>

            {/* Boutons d'édition rapide actifs sur le simulateur */}
            <div className="flex items-center gap-1.5 bg-black/40 p-1 rounded-full border border-white/10">
              <button
                type="button"
                onClick={() => setEditMode(editMode === "text" ? "none" : "text")}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                  editMode === "text"
                    ? "bg-blue-600 text-white shadow-md shadow-blue-500/30"
                    : "text-white/70 hover:text-white hover:bg-white/10"
                }`}
                title="Modifier un texte"
              >
                <Type size={13} />
                <span>Modifier</span>
              </button>

              <button
                type="button"
                onClick={() => setEditMode(editMode === "delete" ? "none" : "delete")}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                  editMode === "delete"
                    ? "bg-red-600 text-white shadow-md shadow-red-500/30"
                    : "text-white/70 hover:text-white hover:bg-white/10"
                }`}
                title="Supprimer un élément"
              >
                <Trash2 size={13} />
                <span>Supprimer</span>
              </button>

              <button
                type="button"
                onClick={() => setShowLogsModal(true)}
                className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold text-emerald-400 hover:bg-white/10 transition-all cursor-pointer"
                title="Journal des logs et Ctrl+Z"
              >
                <ClipboardList size={13} />
                <span>Logs ({logs.length})</span>
              </button>
            </div>

            <div className="tc-simulator-actions">
              <button
                type="button"
                className="tc-simulator-btn"
                onClick={() => {
                  const iframe = document.querySelector(".tc-device-iframe") as HTMLIFrameElement | null;
                  if (iframe) iframe.src = iframe.src;
                }}
                title="Actualiser la vue"
              >
                <RotateCw size={14} />
                <span>Actualiser</span>
              </button>
              <button
                type="button"
                className="tc-simulator-close-btn"
                onClick={() => {
                  setDeviceView("desktop");
                  setEditMode("none");
                }}
                title="Fermer le simulateur"
              >
                <X size={16} />
                <span>Fermer</span>
              </button>
            </div>
          </div>
          <div className="tc-simulator-stage">
            {(() => {
              const scale = typeof window !== "undefined" ? Math.min(1, (window.innerWidth - 32) / 1280) : 1;
              const targetHeight = typeof window !== "undefined" ? window.innerHeight - 150 : 800;
              return (
                <div
                  className={`tc-device-frame tc-frame-${deviceView}`}
                  style={
                    deviceView === "desktop"
                      ? {
                          ["--tc-scale" as string]: String(scale),
                          width: `${Math.round(1280 * scale)}px`,
                          height: `${targetHeight}px`,
                        }
                      : undefined
                  }
                >
                  {deviceView === "mobile" && (
                    <div className="tc-frame-island">
                      <span className="tc-frame-camera" />
                    </div>
                  )}
                  {deviceView === "desktop" ? (
                    <div
                      className="tc-desktop-scaler"
                      style={{
                        width: "1280px",
                        height: `${Math.round(targetHeight / scale)}px`,
                        transform: `scale(${scale})`,
                        transformOrigin: "top left",
                      }}
                    >
                      <iframe title="Aperçu PC" src={`${pathname}?simulator_preview=1`} className="tc-device-iframe" />
                    </div>
                  ) : (
                    <iframe
                      title="Aperçu responsive"
                      src={`${pathname}?simulator_preview=1`}
                      className="tc-device-iframe"
                    />
                  )}
                  <div className="tc-frame-home-bar" />
                </div>
              );
            })()}
          </div>
        </aside>
      )}

      {/* 2. Viseur laser temps réel au survol */}
      {editMode !== "none" && hoveredRect && (
        <div
          className="tc-laser-visor pointer-events-none fixed z-[99999] transition-all duration-75 ease-out"
          style={{
            top: `${hoveredRect.top}px`,
            left: `${hoveredRect.left}px`,
            width: `${hoveredRect.width}px`,
            height: `${hoveredRect.height}px`,
            border: editMode === "delete" ? "2px solid #ef4444" : "2px solid #3b82f6",
            backgroundColor: editMode === "delete" ? "rgba(239, 68, 68, 0.12)" : "rgba(59, 130, 246, 0.12)",
            boxShadow:
              editMode === "delete"
                ? "0 0 0 2px rgba(239, 68, 68, 0.3), 0 0 20px rgba(239, 68, 68, 0.4)"
                : "0 0 0 2px rgba(59, 130, 246, 0.3), 0 0 20px rgba(59, 130, 246, 0.4)",
            borderRadius: "6px",
          }}
        >
          <div
            className={`absolute left-0 -top-7 flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] font-bold text-white shadow-lg whitespace-nowrap ${
              editMode === "delete" ? "bg-red-600" : "bg-blue-600"
            }`}
          >
            <span className="uppercase opacity-80">&lt;{hoveredRect.tag}&gt;</span>
            <span className="max-w-[200px] truncate font-normal opacity-95">« {hoveredRect.preview} »</span>
          </div>
        </div>
      )}

      {/* 3. Bouton engrenage flottant */}
      {!isOpen && (
        <button
          type="button"
          onClick={() => {
            const w = window.innerWidth;
            const native: DeviceView = w < 768 ? "mobile" : w < 1100 ? "tablet" : "desktop";
            setNativeView(native);
            setDeviceView(native);
            setIsOpen(true);
            setIsMinimized(false);
          }}
          className="tc-editor-gear-btn fixed bottom-6 right-6 z-[9999] flex h-13 w-13 items-center justify-center rounded-full bg-[#18261e] text-emerald-400 shadow-2xl border-2 border-emerald-500/50 hover:bg-[#203328] hover:scale-105 active:scale-95 transition-all cursor-pointer"
          title="Ouvrir les réglages du site"
        >
          <Settings size={22} className="animate-[spin_12s_linear_infinite]" />
        </button>
      )}

      {/* 4. Interface iPhone Réglages */}
      {isOpen && !isMinimized && (
        <aside className="tc-site-editor-phone" aria-label="Réglages iPhone">
          <div className="tc-phone-body">
            {/* Dynamic Island */}
            <div className="tc-phone-island">
              <span className="tc-phone-camera" />
              <span className="tc-phone-sensor" />
            </div>

            {/* Barre de statut */}
            <div className="tc-phone-status-bar">
              <span className="tc-phone-time">{timeStr}</span>
              <div className="tc-phone-status-icons">
                <Wifi size={12} />
                <Battery size={13} />
                <button
                  type="button"
                  className="tc-phone-minimize-btn"
                  onClick={() => setIsMinimized(true)}
                  title="Réduire"
                >
                  <Minus size={12} />
                </button>
                <button
                  type="button"
                  className="tc-phone-close-btn"
                  onClick={() => {
                    setIsOpen(false);
                    setEditMode("none");
                  }}
                  title="Fermer"
                >
                  <X size={12} />
                </button>
              </div>
            </div>

            {/* Écran d'accueil Réglages iPhone */}
            <div className="tc-phone-screen">
              <div className="tc-phone-screen-header">
                <h2>Réglages Site</h2>
                <span className="tc-phone-badge">Admin TClean</span>
              </div>
              {/* SECTION 1 : APERÇU APPAREILS */}
              <div className="tc-phone-section">
                <span className="tc-phone-section-title">Aperçu écran réel</span>
                <div className="flex items-center gap-1 p-1 rounded-xl bg-white/[0.06] border border-white/10 backdrop-blur-md">
                  <button
                    type="button"
                    onClick={() => setDeviceView("desktop")}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg text-xs font-semibold transition-all duration-200 cursor-pointer ${
                      deviceView === "desktop"
                        ? "bg-emerald-500 text-slate-950 font-bold shadow-md shadow-emerald-500/25 scale-[1.02]"
                        : "text-white/70 hover:text-white hover:bg-white/10"
                    }`}
                  >
                    <Monitor size={13} />
                    <span>PC</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setDeviceView("tablet")}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg text-xs font-semibold transition-all duration-200 cursor-pointer ${
                      deviceView === "tablet"
                        ? "bg-emerald-500 text-slate-950 font-bold shadow-md shadow-emerald-500/25 scale-[1.02]"
                        : "text-white/70 hover:text-white hover:bg-white/10"
                    }`}
                  >
                    <Tablet size={13} />
                    <span>iPad</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setDeviceView("mobile")}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg text-xs font-semibold transition-all duration-200 cursor-pointer ${
                      deviceView === "mobile"
                        ? "bg-emerald-500 text-slate-950 font-bold shadow-md shadow-emerald-500/25 scale-[1.02]"
                        : "text-white/70 hover:text-white hover:bg-white/10"
                    }`}
                  >
                    <Smartphone size={13} />
                    <span>iPhone</span>
                  </button>
                </div>
              </div>
              {/* SECTION 2 : OUTILS ÉDITEUR */}
              <div className="tc-phone-section">
                <span className="tc-phone-section-title">Outils d'édition</span>
                <div className="tc-phone-app-grid">
                  {/* APP 1 : MODIFIER TEXTE */}
                  <button
                    type="button"
                    className={`tc-app-item ${editMode === "text" ? "tc-app-active" : ""}`}
                    onClick={() => {
                      const next = editMode === "text" ? "none" : "text";
                      setEditMode(next);
                      if (next === "text") {
                        toast.info("🎯 Cliquez sur un texte ou titre pour le modifier.");
                      }
                    }}
                  >
                    <div className="tc-app-icon tc-app-blue">
                      <Type size={20} />
                    </div>
                    <span className="tc-app-name">Modifier</span>
                    <span className="tc-app-sub">{editMode === "text" ? "● Actif" : "Texte"}</span>
                  </button>
                  {/* APP : COULEURS */}
                  <button
                    type="button"
                    className={`tc-app-item ${editMode === "color" ? "tc-app-active" : ""}`}
                    onClick={() => {
                      const next = editMode === "color" ? "none" : "color";
                      setEditMode(next);
                      if (next === "color") {
                        toast.info("🎨 Cliquez sur n'importe quel texte, bouton ou bloc pour modifier sa couleur.");
                      }
                    }}
                  >
                    <div className="tc-app-icon bg-violet-600/30 text-violet-400">
                      <Palette size={20} />
                    </div>
                    <span className="tc-app-name">Couleurs</span>
                    <span className="tc-app-sub">{editMode === "color" ? "● Actif" : "Direct"}</span>
                  </button>

                  {/* APP 2 : SUPPRIMER ÉLÉMENT */}
                  <button
                    type="button"
                    className={`tc-app-item ${editMode === "delete" ? "tc-app-active-red" : ""}`}
                    onClick={() => {
                      const next = editMode === "delete" ? "none" : "delete";
                      setEditMode(next);
                      if (next === "delete") {
                        toast.warning("🎯 Cliquez sur un élément précis à supprimer.");
                      }
                    }}
                  >
                    <div className="tc-app-icon tc-app-red">
                      <Trash2 size={20} />
                    </div>
                    <span className="tc-app-name">Supprimer</span>
                    <span className="tc-app-sub">{editMode === "delete" ? "● Actif" : "Élément"}</span>
                  </button>

                  {/* APP 3 : MODE SOMBRE */}
                  <button type="button" className="tc-app-item" onClick={toggleDarkMode}>
                    <div className="tc-app-icon tc-app-purple">{darkMode ? <Sun size={20} /> : <Moon size={20} />}</div>
                    <span className="tc-app-name">Thème</span>
                    <span className="tc-app-sub">{darkMode ? "Sombre" : "Clair"}</span>
                  </button>

                  {/* APP 4 : JOURNAL DES LOGS ET CTRL+Z */}
                  <button type="button" className="tc-app-item" onClick={() => setShowLogsModal(true)}>
                    <div className="tc-app-icon tc-app-emerald relative">
                      <ClipboardList size={20} />
                      {logs.length > 0 && (
                        <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
                          {logs.length > 9 ? "9+" : logs.length}
                        </span>
                      )}
                    </div>
                    <span className="tc-app-name">Journal logs</span>
                    <span className="tc-app-sub">Ctrl+Z</span>
                  </button>
                  {/* APP 5 : ROUE DE LA CHANCE (ACTIVER / DÉSACTIVER) */}
                  <button
                    type="button"
                    className={`tc-app-item ${isRouletteActive ? "tc-app-active" : ""}`}
                    disabled={rouletteToggling}
                    onClick={async () => {
                      const next = !isRouletteActive;
                      setRouletteToggling(true);
                      try {
                        await toggleRouletteFn({ data: { enabled: next } });
                        await queryClient.invalidateQueries({ queryKey: ["business-config"] });
                        toast.success(
                          next
                            ? "🎡 Roue activée : visible par tous les clients et visiteurs !"
                            : "🎡 Roue désactivée : masquée pour tout le monde sur le site.",
                        );
                      } catch {
                        toast.error("Impossible de modifier le réglage de la roue.");
                      } finally {
                        setRouletteToggling(false);
                      }
                    }}
                  >
                    <div
                      className={`tc-app-icon ${
                        isRouletteActive
                          ? "bg-amber-500/20 text-amber-400 border border-amber-500/40"
                          : "bg-white/10 text-white/40"
                      }`}
                    >
                      <Dices size={20} />
                    </div>
                    <span className="tc-app-name">Roue</span>
                    <span className="tc-app-sub">
                      {rouletteToggling ? "En cours..." : isRouletteActive ? "● Activée" : "○ Coupée"}
                    </span>
                  </button>
                </div>
              </div>

              {/* BANDEAU MODE ACTIF */}
              {editMode !== "none" && (
                <div className={`tc-phone-active-banner ${editMode === "delete" ? "tc-banner-red" : "tc-banner-blue"}`}>
                  <span className="tc-pulse-dot" />
                  <span>
                    {editMode === "delete"
                      ? "Mode suppression : visez le texte ou bouton précis"
                      : "Mode modification : visez le texte ou bouton précis"}
                  </span>
                  <button type="button" onClick={() => setEditMode("none")} className="tc-banner-stop">
                    Arrêter
                  </button>
                </div>
              )}
            </div>

            {/* Dock iPhone */}
            <div className="tc-phone-dock">
              <button
                type="button"
                className="tc-phone-exit-btn"
                onClick={() => {
                  setIsOpen(false);
                  setEditMode("none");
                }}
              >
                Quitter l'éditeur
              </button>
            </div>

            {/* Home bar */}
            <div className="tc-phone-home-indicator" />
          </div>
        </aside>
      )}

      {/* 5. Bulle réduite quand minimisé */}
      {isOpen && isMinimized && (
        <button
          type="button"
          onClick={() => setIsMinimized(false)}
          className="tc-editor-minimized fixed bottom-6 right-6 z-[9999] flex items-center gap-2 rounded-full bg-[#18261e] px-4 py-2 text-xs font-semibold text-emerald-400 shadow-2xl border border-emerald-500/50 hover:bg-[#203328]"
        >
          <Smartphone size={14} />
          <span>Réglages ({editMode === "none" ? "Veille" : editMode})</span>
        </button>
      )}

      {/* 6. Modale de modification de texte */}
      {pendingTextEdit && (
        <div className="tc-editor-modal fixed inset-0 z-[10000] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-xl rounded-2xl bg-[#141e17] border border-emerald-500/40 p-6 shadow-2xl text-white">
            <div className="flex items-center justify-between border-b border-white/10 pb-3 mb-4">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/20 text-blue-400">
                  <Type size={16} />
                </div>
                <div>
                  <h3 className="font-bold text-white text-base">Modifier ce texte</h3>
                  <p className="text-xs text-emerald-300 font-mono">{pendingTextEdit.file}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPendingTextEdit(null)}
                className="rounded-lg p-1.5 text-white/60 hover:bg-white/10 hover:text-white"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-white/70 block mb-1">Texte actuel :</label>
                <div className="rounded-xl bg-black/40 p-3 text-sm text-white/80 font-mono border border-white/10 max-h-24 overflow-y-auto">
                  {pendingTextEdit.original}
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-emerald-300 block mb-1">Nouveau texte :</label>
                <textarea
                  rows={3}
                  value={pendingTextEdit.currentValue}
                  onChange={(e) => setPendingTextEdit({ ...pendingTextEdit, currentValue: e.target.value })}
                  className="w-full rounded-xl bg-black/60 p-3 text-sm text-white border border-emerald-500/40 focus:border-emerald-400 focus:outline-none"
                  placeholder="Tapez le nouveau texte ici..."
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setPendingTextEdit(null)}
                  className="rounded-lg px-3 py-1.5 text-xs text-white/70 hover:bg-white/10"
                >
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await save({
                        data: {
                          kind: "text",
                          key: pendingTextEdit.key,
                          value: pendingTextEdit.currentValue,
                          audience: "all",
                        },
                      });

                      const newLog: EditorLog = {
                        id: crypto.randomUUID(),
                        type: "modify",
                        file: pendingTextEdit.file,
                        description: pendingTextEdit.description,
                        page: pathname,
                        label: pendingTextEdit.label,
                        originalCode: pendingTextEdit.original,
                        newCode: pendingTextEdit.currentValue,
                        key: pendingTextEdit.key,
                        date: new Date().toLocaleString("fr-FR"),
                      };
                      const updated = [newLog, ...logs];
                      setLogs(updated);
                      saveLogs(updated);

                      toast.success("Texte mis à jour !");
                      setPendingTextEdit(null);
                      setTimeout(() => {
                        window.location.reload();
                      }, 400);
                    } catch (err) {
                      toast.error((err as Error).message || "Erreur d'enregistrement.");
                    }
                  }}
                  className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500"
                >
                  <Check size={14} />
                  <span>Appliquer</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 7. Modale du Journal des Logs & Ctrl+Z */}
      {showLogsModal && (
        <div className="tc-logs-modal fixed inset-0 z-[10000] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-2xl max-h-[85vh] flex flex-col rounded-2xl bg-[#141e17] border border-emerald-500/40 shadow-2xl text-white overflow-hidden">
            {/* EN-TÊTE MODALE LOGS */}
            <div className="flex items-center justify-between border-b border-white/10 p-5 shrink-0 bg-black/20">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-400">
                  <ClipboardList size={18} />
                </div>
                <div>
                  <h3 className="font-bold text-white text-base">Journal des modifications & Ctrl+Z</h3>
                  <p className="text-xs text-white/50">
                    {logs.length === 0
                      ? "Aucune modification enregistrée pour l'instant"
                      : `${logs.length} action(s) enregistrée(s)`}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {logs.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm("Effacer tout l'historique des logs ?")) {
                        setLogs([]);
                        saveLogs([]);
                        setSelectedLog(null);
                        toast.success("Historique effacé.");
                      }
                    }}
                    className="text-[11px] text-white/50 hover:text-red-400 px-2 py-1"
                  >
                    Effacer l'historique
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setShowLogsModal(false);
                    setSelectedLog(null);
                  }}
                  className="rounded-lg p-1.5 text-white/60 hover:bg-white/10 hover:text-white"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* BANDEAU ACTIONS RAPIDES : CTRL+Z */}
            {logs.length > 0 && (
              <div className="bg-emerald-950/40 border-b border-emerald-500/20 px-5 py-3 flex items-center justify-between gap-3 shrink-0">
                <div className="flex items-center gap-2 text-xs text-emerald-300">
                  <Undo2 size={16} className="text-emerald-400 shrink-0" />
                  <span>
                    Dernière action : <strong>{logs[0]?.label}</strong> (
                    {logs[0]?.type === "delete" ? "suppression" : "modification"})
                  </span>
                </div>
                <button
                  type="button"
                  disabled={undoing}
                  onClick={() => logs[0] && handleUndo(logs[0])}
                  className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-1.5 text-xs font-bold text-white shadow hover:bg-emerald-500 disabled:opacity-50"
                >
                  <Undo2 size={13} />
                  <span>{undoing ? "Rétablissement..." : "Annuler (Ctrl+Z)"}</span>
                </button>
              </div>
            )}

            {/* FILTRES LOGS */}
            <div className="flex items-center gap-2 px-5 py-2.5 border-b border-white/5 bg-black/10 shrink-0">
              <span className="text-xs text-white/50 mr-1">Filtrer :</span>
              <button
                type="button"
                onClick={() => setLogFilter("all")}
                className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                  logFilter === "all" ? "bg-white/20 text-white" : "bg-white/5 text-white/60 hover:text-white"
                }`}
              >
                Tous ({logs.length})
              </button>
              <button
                type="button"
                onClick={() => setLogFilter("delete")}
                className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                  logFilter === "delete" ? "bg-red-600 text-white" : "bg-red-950/40 text-red-300 hover:bg-red-950/70"
                }`}
              >
                Suppressions ({logs.filter((l) => l.type === "delete").length})
              </button>
              <button
                type="button"
                onClick={() => setLogFilter("modify")}
                className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                  logFilter === "modify"
                    ? "bg-amber-600 text-white"
                    : "bg-amber-950/40 text-amber-300 hover:bg-amber-950/70"
                }`}
              >
                Modifications ({logs.filter((l) => l.type === "modify").length})
              </button>
            </div>

            {/* LISTE OU DÉTAIL D'UN LOG */}
            <div className="flex-1 overflow-y-auto p-5 space-y-3">
              {logs.length === 0 ? (
                <div className="py-12 text-center text-white/40">
                  <ClipboardList size={36} className="mx-auto mb-2 opacity-30" />
                  <p className="text-sm">Aucune modification enregistrée pour l'instant.</p>
                  <p className="text-xs mt-1 text-white/30">
                    Cliquez sur « Modifier » ou « Supprimer » dans les Réglages pour commencer.
                  </p>
                </div>
              ) : selectedLog ? (
                /* VUE DÉTAILLÉE D'UN LOG */
                <div className="space-y-4 rounded-xl bg-black/40 p-4 border border-emerald-500/30">
                  <div className="flex items-center justify-between border-b border-white/10 pb-2">
                    <button
                      type="button"
                      onClick={() => setSelectedLog(null)}
                      className="text-xs text-emerald-400 hover:underline flex items-center gap-1"
                    >
                      ← Retour à la liste des logs
                    </button>
                    <span
                      className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase ${
                        selectedLog.type === "delete" ? "bg-red-900/60 text-red-300" : "bg-amber-900/60 text-amber-300"
                      }`}
                    >
                      {selectedLog.type === "delete" ? "Suppression" : "Modification"}
                    </span>
                  </div>

                  <div>
                    <span className="text-[11px] font-semibold text-white/50 block">Fichier source détecté :</span>
                    <div className="mt-1 flex items-center justify-between rounded-lg bg-black/60 p-2.5 font-mono text-xs text-emerald-300 border border-white/10">
                      <span>{selectedLog.file}</span>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(selectedLog.file, "file")}
                        className="flex items-center gap-1 rounded bg-white/10 px-2 py-1 text-[11px] text-white hover:bg-white/20"
                      >
                        {copiedType === "file" ? <Check size={12} /> : <Copy size={12} />}
                        <span>Copier</span>
                      </button>
                    </div>
                  </div>

                  <div>
                    <span className="text-[11px] font-semibold text-white/50 block">Code d'origine à rechercher :</span>
                    <div className="mt-1 rounded-lg bg-black/60 p-2.5 font-mono text-xs text-white/80 border border-white/10 max-h-32 overflow-y-auto">
                      {selectedLog.originalCode}
                    </div>
                  </div>

                  {selectedLog.newCode && (
                    <div>
                      <span className="text-[11px] font-semibold text-emerald-400 block">Remplacé par :</span>
                      <div className="mt-1 rounded-lg bg-emerald-950/30 p-2.5 font-mono text-xs text-emerald-200 border border-emerald-500/20 max-h-32 overflow-y-auto">
                        {selectedLog.newCode}
                      </div>
                    </div>
                  )}

                  <div className="border-t border-white/10 pt-3 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const consigne =
                          selectedLog.type === "delete"
                            ? `Supprime l'élément dans ${selectedLog.file} : "${selectedLog.originalCode}"`
                            : `Dans ${selectedLog.file}, remplace "${selectedLog.originalCode}" par "${selectedLog.newCode}"`;
                        void copyToClipboard(consigne, "prompt");
                      }}
                      className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-500"
                    >
                      {copiedType === "prompt" ? <Check size={14} /> : <FileCode size={14} />}
                      <span>Copier la consigne exacte</span>
                    </button>

                    <button
                      type="button"
                      disabled={undoing}
                      onClick={() => handleUndo(selectedLog)}
                      className="ml-auto flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-bold text-white shadow hover:bg-blue-500 disabled:opacity-50"
                    >
                      <Undo2 size={14} />
                      <span>{undoing ? "Rétablissement..." : "Remettre comme avant"}</span>
                    </button>
                  </div>
                </div>
              ) : (
                /* LISTE DE TOUS LES LOGS */
                filteredLogs.map((log) => (
                  <div
                    key={log.id}
                    className="rounded-xl bg-white/5 p-3.5 border border-white/10 hover:border-emerald-500/50 hover:bg-white/[0.08] transition-all flex items-start justify-between gap-3"
                  >
                    <div className="flex items-start gap-3 cursor-pointer flex-1" onClick={() => setSelectedLog(log)}>
                      <div
                        className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
                          log.type === "delete" ? "bg-red-950 text-red-400" : "bg-amber-950 text-amber-400"
                        }`}
                      >
                        {log.type === "delete" ? <Trash2 size={14} /> : <Type size={14} />}
                      </div>
                      <div>
                        <div className="flex items-center gap-2 mb-0.5">
                          <strong className="text-xs font-semibold text-white">{log.label}</strong>
                          <span
                            className={`rounded px-1.5 py-0.2 text-[9px] font-bold uppercase ${
                              log.type === "delete" ? "bg-red-900/60 text-red-300" : "bg-amber-900/60 text-amber-300"
                            }`}
                          >
                            {log.type === "delete" ? "Supprimé" : "Modifié"}
                          </span>
                        </div>
                        <p className="text-[11px] font-mono text-emerald-300">
                          {log.file} <span className="text-white/40">({log.page})</span>
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        disabled={undoing}
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleUndo(log);
                        }}
                        className="flex items-center gap-1 rounded-lg bg-blue-600/80 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-blue-600 transition-colors"
                        title="Annuler cette action et remettre cet élément comme avant"
                      >
                        <Undo2 size={12} />
                        <span>Remettre</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setSelectedLog(log)}
                        className="text-[11px] text-emerald-400 hover:underline inline-flex items-center gap-1 font-semibold"
                      >
                        Voir code <ArrowRight size={11} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
      {/* 8. Modale de personnalisation des couleurs au clic */}
      {pendingColorEdit && (
        <div
          className="tc-editor-modal fixed inset-0 z-[10001] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm animate-in fade-in"
          onClick={(e) => {
            if (e.target === e.currentTarget) setPendingColorEdit(null);
          }}
        >
          <div className="w-full max-w-md rounded-2xl bg-[#141e17] border border-emerald-500/40 p-5 shadow-2xl text-white">
            <div className="flex items-center justify-between border-b border-white/10 pb-3 mb-4">
              <div className="flex items-center gap-2">
                <Palette className="text-emerald-400" size={18} />
                <h3 className="font-bold text-white text-sm">Couleur : {pendingColorEdit.label}</h3>
              </div>
              <button
                type="button"
                onClick={() => setPendingColorEdit(null)}
                className="rounded-lg p-1.5 text-white/60 hover:bg-white/10 hover:text-white"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-emerald-300 block mb-1">Couleur du texte :</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={pendingColorEdit.color || "#ffffff"}
                    onChange={(e) => setPendingColorEdit({ ...pendingColorEdit, color: e.target.value })}
                    className="h-10 w-14 rounded cursor-pointer bg-transparent border border-white/20 p-1"
                  />
                  <input
                    type="text"
                    value={pendingColorEdit.color}
                    placeholder="#ffffff (vide = couleur par défaut)"
                    onChange={(e) => setPendingColorEdit({ ...pendingColorEdit, color: e.target.value })}
                    className="flex-1 rounded-xl bg-black/60 px-3 py-2 text-xs text-white border border-white/10"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-emerald-300 block mb-1">Couleur de fond :</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={pendingColorEdit.bgColor || "#000000"}
                    onChange={(e) => setPendingColorEdit({ ...pendingColorEdit, bgColor: e.target.value })}
                    className="h-10 w-14 rounded cursor-pointer bg-transparent border border-white/20 p-1"
                  />
                  <input
                    type="text"
                    value={pendingColorEdit.bgColor}
                    placeholder="#000000 (vide = fond par défaut)"
                    onChange={(e) => setPendingColorEdit({ ...pendingColorEdit, bgColor: e.target.value })}
                    className="flex-1 rounded-xl bg-black/60 px-3 py-2 text-xs text-white border border-white/10"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-emerald-300 block mb-1">Couleur de bordure :</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={pendingColorEdit.borderColor || "#10b981"}
                    onChange={(e) => setPendingColorEdit({ ...pendingColorEdit, borderColor: e.target.value })}
                    className="h-10 w-14 rounded cursor-pointer bg-transparent border border-white/20 p-1"
                  />
                  <input
                    type="text"
                    value={pendingColorEdit.borderColor}
                    placeholder="#10b981 (vide = bordure par défaut)"
                    onChange={(e) => setPendingColorEdit({ ...pendingColorEdit, borderColor: e.target.value })}
                    className="flex-1 rounded-xl bg-black/60 px-3 py-2 text-xs text-white border border-white/10"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setPendingColorEdit(null)}
                  className="rounded-lg px-3 py-1.5 text-xs text-white/70 hover:bg-white/10"
                >
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      const colors: Record<string, string> = {};
                      if (pendingColorEdit.color) colors["color"] = pendingColorEdit.color;
                      if (pendingColorEdit.bgColor) colors["background-color"] = pendingColorEdit.bgColor;
                      if (pendingColorEdit.borderColor) colors["border-color"] = pendingColorEdit.borderColor;

                      await saveColors({
                        data: {
                          kind: "element",
                          key: pendingColorEdit.key,
                          colors: Object.keys(colors).length > 0 ? (colors as any) : null,
                        },
                      });

                      toast.success("Couleurs enregistrées !");
                      setPendingColorEdit(null);
                      setTimeout(() => {
                        window.location.reload();
                      }, 400);
                    } catch (err) {
                      toast.error((err as Error).message || "Erreur d'enregistrement.");
                    }
                  }}
                  className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500"
                >
                  <Check size={14} />
                  <span>Enregistrer la couleur</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
