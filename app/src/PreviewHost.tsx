import * as React from "react";
import {
  Box,
  CssBaseline,
  Menu,
  MenuItem,
  ThemeProvider,
  Typography,
  createTheme,
} from "@mui/material";
import { requireShim } from "./require-table";
import { parseTemplateSpec, resolveActionQuery } from "./click-query-lite";

/** structuredContent.preview shape produced by the server's buildPreviewPayload(). */
export interface PreviewPayload {
  name: string;
  version?: number;
  compiledCode: string;
  defaultProps: Record<string, unknown>;
  clickQueryTemplate: string | null;
  interactionPropName: string | null;
  callbackNames: string[];
  contextMenuPropName?: string | null;
  /** Normalized project brand (server-side) — themes the preview like the embed. */
  brandSettings?: Record<string, unknown>;
}

interface MenuState {
  x: number;
  y: number;
  item: Record<string, unknown>;
}

/** "onAddToCart" → "Add to cart" */
function humanizeAction(action: string): string {
  const words = action
    .replace(/^on/, "")
    .replace(/([A-Z])/g, " $1")
    .trim()
    .toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

interface BrandLike {
  primaryColor?: string;
  secondaryColor?: string;
  darkMode?: boolean;
  borderRadius?: number;
  backgroundColor?: string;
  fontStyle?: { fontFamily?: string };
}

/** Branded MUI theme from the shipped settings; neutral defaults when absent. */
function buildPreviewTheme(brand: BrandLike | undefined) {
  const darkMode = brand?.darkMode !== false;
  return createTheme({
    palette: {
      mode: darkMode ? "dark" : "light",
      ...(brand?.primaryColor ? { primary: { main: brand.primaryColor } } : {}),
      ...(brand?.secondaryColor
        ? { secondary: { main: brand.secondaryColor } }
        : {}),
      ...(brand?.backgroundColor
        ? {
            background: {
              default: brand.backgroundColor,
              paper: brand.backgroundColor,
            },
          }
        : {}),
    },
    shape: {
      borderRadius:
        typeof brand?.borderRadius === "number" ? brand.borderRadius : 12,
    },
    ...(brand?.fontStyle?.fontFamily
      ? { typography: { fontFamily: brand.fontStyle.fontFamily } }
      : {}),
  });
}

type ModuleFactory = (
  require: unknown,
  module: unknown,
  exports: unknown,
) => void;

declare global {
  interface Window {
    __BX_PREVIEW_FACTORY__?: ModuleFactory;
  }
}

/**
 * Turn compiled CJS into a callable factory. `new Function` first; if the host
 * CSP forbids eval, fall back to an injected inline <script> — inline execution
 * is necessarily permitted wherever this bundle (itself inline) runs at all.
 */
function makeFactory(compiledCode: string): ModuleFactory {
  try {
    return new Function(
      "require",
      "module",
      "exports",
      compiledCode,
    ) as ModuleFactory;
  } catch {
    delete window.__BX_PREVIEW_FACTORY__;
    const script = document.createElement("script");
    script.textContent = `window.__BX_PREVIEW_FACTORY__ = function (require, module, exports) {\n${compiledCode}\n};`;
    document.head.appendChild(script);
    script.remove();
    const factory = window.__BX_PREVIEW_FACTORY__;
    if (!factory) throw new Error("Host CSP blocked element evaluation.");
    return factory;
  }
}

/** Evaluate the compiled CJS module and return its default Component export. */
function evaluateComponent(
  compiledCode: string,
): React.ComponentType<Record<string, unknown>> {
  const moduleRef = { exports: {} as Record<string, unknown> };
  makeFactory(compiledCode)(requireShim, moduleRef, moduleRef.exports);
  const Component = moduleRef.exports.default ?? moduleRef.exports.Component;
  if (typeof Component !== "function") {
    throw new Error(
      "Compiled element has no `export default function Component`.",
    );
  }
  return Component as React.ComponentType<Record<string, unknown>>;
}

class PreviewErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <Box
          sx={{
            p: 2,
            fontFamily: "system-ui",
            color: "#b91c1c",
            fontSize: 13.5,
          }}
        >
          Element failed to render: {this.state.error.message}
        </Box>
      );
    }
    return this.props.children;
  }
}

/**
 * Renders the element with its contract demo props, with every declared callback
 * replaced by a shim that shows the EXACT query the click would send — the same
 * idea as Vibe Studio's interactive preview.
 */
export function PreviewHost({ payload }: { payload: PreviewPayload }) {
  const [toast, setToast] = React.useState<string | null>(null);
  const [menu, setMenu] = React.useState<MenuState | null>(null);
  const toastTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const showQuery = React.useCallback((query: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(query);
    toastTimer.current = setTimeout(() => setToast(null), 4500);
  }, []);

  const evaluated = React.useMemo(() => {
    try {
      return {
        Component: evaluateComponent(payload.compiledCode),
        error: null as string | null,
      };
    } catch (error) {
      return {
        Component: null,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }, [payload.compiledCode]);

  const spec = React.useMemo(
    () => parseTemplateSpec(payload.clickQueryTemplate),
    [payload.clickQueryTemplate],
  );

  const props = React.useMemo(() => {
    const shims: Record<string, unknown> = {};
    for (const action of payload.callbackNames) {
      const isPrimary = action === payload.interactionPropName;
      shims[action] = (...args: unknown[]) => {
        showQuery(
          `Would send: “${resolveActionQuery(action, isPrimary, spec, args)}”`,
        );
      };
    }
    if (payload.contextMenuPropName) {
      shims[payload.contextMenuPropName] = (event: unknown, item: unknown) => {
        const mouse = event as {
          preventDefault?: () => void;
          clientX?: number;
          clientY?: number;
        };
        mouse?.preventDefault?.();
        setMenu({
          x: mouse?.clientX ?? 0,
          y: mouse?.clientY ?? 0,
          item:
            item !== null && typeof item === "object"
              ? (item as Record<string, unknown>)
              : { userInput: item },
        });
      };
    }
    return { ...payload.defaultProps, ...shims };
  }, [payload, spec, showQuery]);

  const menuActions = React.useMemo(() => {
    if (!menu) return [];
    const actions: { label: string; query: string }[] = [];
    const primary = payload.interactionPropName;
    if (primary) {
      actions.push({
        label: humanizeAction(primary),
        query: resolveActionQuery(primary, true, spec, [menu.item]),
      });
    }
    for (const action of Object.keys(spec.actions)) {
      if (action === primary) continue;
      actions.push({
        label: humanizeAction(action),
        query: resolveActionQuery(action, false, spec, [menu.item]),
      });
    }
    return actions;
  }, [menu, payload, spec]);

  const theme = React.useMemo(
    () => buildPreviewTheme(payload.brandSettings as BrandLike | undefined),
    [payload.brandSettings],
  );

  if (!evaluated.Component) {
    return (
      <Box
        sx={{ p: 2, fontFamily: "system-ui", color: "#b91c1c", fontSize: 13.5 }}
      >
        Element failed to load: {evaluated.error}
      </Box>
    );
  }
  const Component = evaluated.Component;

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box sx={{ position: "relative", p: 1.5, bgcolor: "background.default" }}>
        <PreviewErrorBoundary>
          <Component {...props} />
        </PreviewErrorBoundary>

        <Menu
          open={menu !== null}
          onClose={() => setMenu(null)}
          anchorReference="anchorPosition"
          anchorPosition={menu ? { top: menu.y, left: menu.x } : undefined}
          disableAutoFocusItem
        >
          {menuActions.map((action) => (
            <MenuItem
              key={action.label}
              dense
              onClick={() => {
                setMenu(null);
                showQuery(`Would send: “${action.query}”`);
              }}
            >
              {action.label}
            </MenuItem>
          ))}
        </Menu>

        <Typography
          sx={{
            mt: 1,
            textAlign: "center",
            fontSize: 11.5,
            color: "#9a9186",
            fontFamily: "system-ui",
          }}
        >
          {payload.name}
          {payload.version ? ` · v${payload.version}` : ""} — interactions show
          the query they would send
        </Typography>

        {toast ? (
          <Box
            sx={{
              position: "fixed",
              left: "50%",
              bottom: 14,
              transform: "translateX(-50%)",
              maxWidth: "92%",
              px: 2,
              py: 1.1,
              borderRadius: "10px",
              bgcolor: "rgba(14,16,19,.92)",
              color: "#94C2FA",
              fontSize: 13,
              fontFamily: "system-ui",
              boxShadow: "0 6px 24px rgba(0,0,0,.35)",
              zIndex: 10,
            }}
          >
            {toast}
          </Box>
        ) : null}
      </Box>
    </ThemeProvider>
  );
}
