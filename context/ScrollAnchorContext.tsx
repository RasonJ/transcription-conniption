import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import { ScrollView, View, type LayoutChangeEvent } from "react-native";
import { scaledAnchorOffset } from "@/utils/folioScale";
import { anchorFromLineIndex } from "@/utils/scrollAnchor";

export type ScrollHighlight = { folioId: string; lineNumber?: string } | null;

export type ScrollAnchorTarget = {
  folioId: string;
  lineNumber?: string;
};

type ScrollAnchorContextValue = {
  parchmentRef: RefObject<ScrollView | null>;
  parchmentContentRef: RefObject<View | null>;
  scrollHighlight: ScrollHighlight;
  setScrollHighlight: (highlight: ScrollHighlight) => void;
  registerFolioOffset: (folioId: string, y: number) => void;
  registerLineOffset: (folioId: string, lineNumber: string, y: number) => void;
  navigateToAnchor: (target: ScrollAnchorTarget) => void;
  navigateToLineIndex: (lineIndex: number, transcriptionText: string) => void;
  remeasureFolio: (folioId: string, folioRef: RefObject<View | null>) => void;
  setViewportScale: (scale: number) => void;
};

const ScrollAnchorContext = createContext<ScrollAnchorContextValue | null>(null);

export function ScrollAnchorProvider({ children }: { children: React.ReactNode }) {
  const parchmentRef = useRef<ScrollView>(null);
  const parchmentContentRef = useRef<View>(null);
  const folioOffsets = useRef<Record<string, number>>({});
  const lineOffsets = useRef<Record<string, number>>({});
  const scaleRef = useRef(1);
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [scrollHighlight, setScrollHighlight] = useState<ScrollHighlight>(null);
  const setViewportScale = useCallback((scale: number) => {
    scaleRef.current = scale > 0 ? scale : 1;
  }, []);

  const registerFolioOffset = useCallback((folioId: string, y: number) => {
    folioOffsets.current[folioId] = y;
  }, []);

  const registerLineOffset = useCallback((folioId: string, lineNumber: string, y: number) => {
    lineOffsets.current[`${folioId}:${lineNumber}`] = y;
  }, []);

  const navigateToAnchor = useCallback((target: ScrollAnchorTarget) => {
    setScrollHighlight({ folioId: target.folioId, lineNumber: target.lineNumber });
    if (highlightTimer.current) clearTimeout(highlightTimer.current);
    highlightTimer.current = setTimeout(() => setScrollHighlight(null), 2000);
    const lineKey = target.lineNumber ? `${target.folioId}:${target.lineNumber}` : null;
    const y =
      lineKey && lineOffsets.current[lineKey] !== undefined
        ? lineOffsets.current[lineKey]
        : folioOffsets.current[target.folioId];
    if (y !== undefined) {
      const scaled = scaledAnchorOffset(y, scaleRef.current);
      parchmentRef.current?.scrollTo({ y: Math.max(0, scaled - 32), animated: true });
    }
  }, []);

  const navigateToLineIndex = useCallback(
    (lineIndex: number, transcriptionText: string) => {
      const anchor = anchorFromLineIndex(transcriptionText, lineIndex);
      if (anchor.folioId) {
        navigateToAnchor({ folioId: anchor.folioId, lineNumber: anchor.lineNumber });
      }
    },
    [navigateToAnchor],
  );

  const remeasureFolio = useCallback((folioId: string, folioRef: RefObject<View | null>) => {
    const contentNode = parchmentContentRef.current;
    const folioNode = folioRef.current;
    if (!contentNode || !folioNode) {
      return;
    }
    folioNode.measureLayout(
      contentNode,
      (_x, y) => {
        registerFolioOffset(folioId, y);
      },
      () => {},
    );
  }, [registerFolioOffset]);

  const value = useMemo(
    () => ({
      parchmentRef,
      parchmentContentRef,
      scrollHighlight,
      setScrollHighlight,
      registerFolioOffset,
      registerLineOffset,
      navigateToAnchor,
      navigateToLineIndex,
      remeasureFolio,
      setViewportScale,
    }),
    [
      scrollHighlight,
      registerFolioOffset,
      registerLineOffset,
      navigateToAnchor,
      navigateToLineIndex,
      remeasureFolio,
      setViewportScale,
    ],
  );

  return <ScrollAnchorContext.Provider value={value}>{children}</ScrollAnchorContext.Provider>;
}

export function useScrollAnchor(): ScrollAnchorContextValue {
  const ctx = useContext(ScrollAnchorContext);
  if (!ctx) {
    throw new Error("useScrollAnchor must be used within ScrollAnchorProvider");
  }
  return ctx;
}

/** Measure a block row against the parchment content container. */
export function useRegisterLineAnchor(
  folioId: string,
  lineNumber: string | undefined,
  blockRef: RefObject<View | null>,
) {
  const { parchmentContentRef, registerLineOffset } = useScrollAnchor();

  const onBlockLayout = useCallback(
    (_event: LayoutChangeEvent) => {
      if (!lineNumber) {
        return;
      }
      const contentNode = parchmentContentRef.current;
      const blockNode = blockRef.current;
      if (!contentNode || !blockNode) {
        return;
      }
      blockNode.measureLayout(
        contentNode,
        (_x, y) => {
          registerLineOffset(folioId, lineNumber, y);
        },
        () => {},
      );
    },
    [folioId, lineNumber, parchmentContentRef, registerLineOffset, blockRef],
  );

  return onBlockLayout;
}
