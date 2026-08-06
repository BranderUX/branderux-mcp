/**
 * CommonJS require() shim for evaluated element code.
 *
 * Element TSX is compiled server-side with sucrase (typescript + jsx + imports,
 * automatic JSX runtime), so the compiled module require()s from the sandbox
 * allowlist. Everything it may ask for is bundled here and served from this
 * table — nothing loads over the network, which is what the MCP App CSP expects.
 */
import * as React from "react";
import * as JsxRuntime from "react/jsx-runtime";
import * as Mui from "@mui/material";
import * as MuiSystem from "@mui/system";
import * as EmotionReact from "@emotion/react";
import * as EmotionStyled from "@emotion/styled";
import * as Lucide from "lucide-react";
import * as Recharts from "recharts";
import * as FramerMotion from "framer-motion";
import * as DateFns from "date-fns";

const TABLE: Record<string, unknown> = {
  react: React,
  "react/jsx-runtime": JsxRuntime,
  "@mui/material": Mui,
  "@mui/system": MuiSystem,
  "@emotion/react": EmotionReact,
  "@emotion/styled": EmotionStyled,
  "lucide-react": Lucide,
  recharts: Recharts,
  "framer-motion": FramerMotion,
  "date-fns": DateFns,
};

/** Subpath imports (`@mui/material/Box`) resolve to the named export of the root. */
export function requireShim(specifier: string): unknown {
  const direct = TABLE[specifier];
  if (direct) return direct;

  const muiSub = specifier.match(/^@mui\/material\/([A-Za-z0-9]+)$/);
  if (muiSub) {
    const named = (Mui as Record<string, unknown>)[muiSub[1]!];
    if (named) return { __esModule: true, default: named };
  }
  throw new Error(`Import "${specifier}" is not in the sandbox allowlist.`);
}
