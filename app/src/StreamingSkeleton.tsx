import * as React from "react";
import { Box, Skeleton, Stack, Typography } from "@mui/material";

/**
 * What the panel shows while the tool arguments stream (the agent is still
 * writing the element's code). Neutral dark-on-transparent — it must read as
 * "something is being built", never as a wrong brand and never as a white box.
 */
export function StreamingSkeleton({ name }: { name: string }) {
  return (
    <Box sx={{ p: 1.5 }}>
      <Box
        sx={{
          borderRadius: "12px",
          border: "1px solid rgba(128,128,128,0.25)",
          bgcolor: "rgba(128,128,128,0.06)",
          p: 2,
        }}
      >
        <Skeleton
          variant="rectangular"
          sx={{
            width: "100%",
            height: 120,
            borderRadius: "8px",
            bgcolor: "rgba(128,128,128,0.14)",
          }}
        />
        <Skeleton
          variant="text"
          width="55%"
          height={26}
          sx={{ mt: 1.5, bgcolor: "rgba(128,128,128,0.14)" }}
        />
        <Skeleton
          variant="text"
          width="85%"
          sx={{ bgcolor: "rgba(128,128,128,0.12)" }}
        />
        <Stack direction="row" spacing={1} sx={{ mt: 1.5 }}>
          <Skeleton
            variant="rounded"
            width={72}
            height={26}
            sx={{ bgcolor: "rgba(128,128,128,0.12)" }}
          />
          <Skeleton
            variant="rounded"
            width={56}
            height={26}
            sx={{ bgcolor: "rgba(128,128,128,0.12)" }}
          />
        </Stack>
      </Box>
      <Typography
        sx={{
          mt: 1,
          textAlign: "center",
          fontSize: 11.5,
          color: "#9a9186",
          fontFamily: "system-ui",
        }}
      >
        {name ? `Building “${name}”…` : "Building element…"}
      </Typography>
    </Box>
  );
}
