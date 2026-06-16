"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { getHintEngine, type HintEngineClient, type HintResult } from "../lib/hintEngine";

export type UseHintEngine = {
  /** True once the wasm module has finished loading. */
  ready: boolean;
  /** True while a hint is being computed. */
  loading: boolean;
  /** Runs the solver; rejects on engine errors (invalid/unsolvable board). */
  getHint: (puzzle: string, candidates?: string) => Promise<HintResult | null>;
};

/**
 * React access to the shared l2sg hint engine. The worker is created on first
 * mount and reused for the page lifetime (see getHintEngine), so this hook only
 * tracks the load/compute state rather than owning teardown.
 */
export function useHintEngine(): UseHintEngine {
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const engineRef = useRef<HintEngineClient | null>(null);

  useEffect(() => {
    let active = true;
    let engine: HintEngineClient;
    try {
      engine = getHintEngine();
    } catch {
      return; // not in a browser (e.g. SSR) — stays not-ready
    }
    engineRef.current = engine;
    engine.ready.then(
      () => {
        if (active) {
          setReady(true);
        }
      },
      () => {
        if (active) {
          setReady(false);
        }
      }
    );
    return () => {
      active = false;
    };
  }, []);

  const getHint = useCallback(async (puzzle: string, candidates = ""): Promise<HintResult | null> => {
    const engine = engineRef.current ?? getHintEngine();
    setLoading(true);
    try {
      return await engine.getHint(puzzle, candidates);
    } finally {
      setLoading(false);
    }
  }, []);

  return { ready, loading, getHint };
}
