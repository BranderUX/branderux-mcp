import * as React from "react";
import createCache, { type EmotionCache } from "@emotion/cache";
import { CacheProvider } from "@emotion/react";
import {
  Box,
  CssBaseline,
  ThemeProvider,
  Typography,
  createTheme,
} from "@mui/material";
import { prefixer } from "stylis";
import rtlPlugin from "stylis-plugin-rtl";
import { requireShim } from "./require-table";
import {
  isPrimaryAction,
  parseTemplateSpec,
  resolveActionQuery,
} from "./click-query-lite";

/** structuredContent.preview shape produced by the server's buildPreviewPayload(). */
export interface PreviewPayload {
  name: string;
  version?: number;
  compiledCode: string;
  defaultProps: Record<string, unknown>;
  clickQueryTemplate: string | null;
  /** The DERIVED primary (runtime rules), never the stored field — see compile.ts. */
  interactionPropName: string | null;
  callbackNames: string[];
  /** Normalized project brand (server-side) — themes the preview like the embed. */
  brandSettings?: Record<string, unknown>;
  /** The site's language and text direction — the preview renders like the site. */
  language?: string;
  direction?: "ltr" | "rtl";
}

interface BrandLike {
  primaryColor?: string;
  secondaryColor?: string;
  accentColor?: string;
  darkMode?: boolean;
  borderRadius?: number;
  backgroundColor?: string;
  fontStyle?: { fontFamily?: string };
}

let rtlCache: EmotionCache | null = null;
function getRtlCache(): EmotionCache {
  if (!rtlCache) rtlCache = createCache({ key: "mui-rtl", stylisPlugins: [prefixer, rtlPlugin] });
  return rtlCache;
}

/**
 * Branded MUI theme from the shipped settings; neutral defaults when absent.
 * SAME palette mapping as the client's element sandbox
 * (public/element-sandbox/frame.html buildTheme), so the panel verifies what
 * the site renders: the brand accent is `info.main`, the mode is DARK unless
 * the brand says darkMode: false (the client's normalizeBrandSettings defaults
 * a missing darkMode to true before the frame theme is built), and
 * `background.default` is the REAL brand background — a colour, so an element
 * reading it gets a colour.
 */
function buildPreviewTheme(brand: BrandLike | undefined, direction: "ltr" | "rtl") {
  const darkMode = brand?.darkMode !== false;
  return createTheme({
    direction,
    palette: {
      mode: darkMode ? "dark" : "light",
      ...(brand?.primaryColor ? { primary: { main: brand.primaryColor } } : {}),
      ...(brand?.secondaryColor
        ? { secondary: { main: brand.secondaryColor } }
        : {}),
      ...(brand?.accentColor ? { info: { main: brand.accentColor } } : {}),
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
      const isPrimary = isPrimaryAction(action, payload.interactionPropName);
      shims[action] = (...args: unknown[]) => {
        showQuery(
          `Would send: “${resolveActionQuery(action, isPrimary, spec, args)}”`,
        );
      };
    }
    return { ...payload.defaultProps, ...shims };
  }, [payload, spec, showQuery]);

  const direction = payload.direction === "rtl" ? "rtl" : "ltr";
  const theme = React.useMemo(
    () => buildPreviewTheme(payload.brandSettings as BrandLike | undefined, direction),
    [payload.brandSettings, direction],
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

  const tree = (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box
        dir={direction}
        lang={payload.language}
        sx={{ position: "relative", p: 1.5, bgcolor: "background.default" }}
      >
        <PreviewErrorBoundary>
          <Component {...props} />
        </PreviewErrorBoundary>

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
  // RTL sites: an emotion cache with the stylis RTL plugin flips MUI's physical sides — the same
  // mechanism as the site; LTR renders through the default cache, untouched.
  return direction === "rtl" ? <CacheProvider value={getRtlCache()}>{tree}</CacheProvider> : tree;
}
