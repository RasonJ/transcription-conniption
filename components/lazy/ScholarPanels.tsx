/**
 * Lazy Tier 1 panels (SPEC-LIGHTWEIGHT LW-2). The Studio screen renders these wrappers, so
 * the drawers' code — and the concordance, dictionary and copilot behind them — loads only
 * when a panel is first shown.
 */
import {
  loadConcordanceDrawer,
  loadIngestPanel,
  loadManuscriptChatbotDrawer,
} from "@/utils/lazy/loadScholar";
import type { ComponentProps } from "react";
import React, { Suspense, lazy } from "react";

type ConcordanceDrawerProps = ComponentProps<
  Awaited<ReturnType<typeof loadConcordanceDrawer>>["ConcordanceDrawer"]
>;
type ChatbotDrawerProps = ComponentProps<
  Awaited<ReturnType<typeof loadManuscriptChatbotDrawer>>["ManuscriptChatbotDrawer"]
>;
type IngestPanelProps = ComponentProps<
  Awaited<ReturnType<typeof loadIngestPanel>>["IngestPanel"]
>;

const ConcordanceDrawerLazy = lazy(() =>
  loadConcordanceDrawer().then((m) => ({ default: m.ConcordanceDrawer })),
);
const ManuscriptChatbotDrawerLazy = lazy(() =>
  loadManuscriptChatbotDrawer().then((m) => ({ default: m.ManuscriptChatbotDrawer })),
);
const IngestPanelLazy = lazy(() => loadIngestPanel().then((m) => ({ default: m.IngestPanel })));

/** Mounts the drawer only once it has been opened, then keeps it mounted for its close animation. */
function useOpenedOnce(visible: boolean): boolean {
  const [opened, setOpened] = React.useState(visible);
  React.useEffect(() => {
    if (visible) setOpened(true);
  }, [visible]);
  return opened || visible;
}

export function ConcordanceDrawer(props: ConcordanceDrawerProps) {
  const mounted = useOpenedOnce(Boolean(props.visible));
  if (!mounted) return null;
  return (
    <Suspense fallback={null}>
      <ConcordanceDrawerLazy {...props} />
    </Suspense>
  );
}

export function ManuscriptChatbotDrawer(props: ChatbotDrawerProps) {
  const mounted = useOpenedOnce(Boolean(props.visible));
  if (!mounted) return null;
  return (
    <Suspense fallback={null}>
      <ManuscriptChatbotDrawerLazy {...props} />
    </Suspense>
  );
}

export function IngestPanel(props: IngestPanelProps) {
  return (
    <Suspense fallback={null}>
      <IngestPanelLazy {...props} />
    </Suspense>
  );
}
