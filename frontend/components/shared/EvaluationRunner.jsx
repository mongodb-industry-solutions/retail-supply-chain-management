"use client";

import { useEffect, useRef } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
  setAffectedSuppliers,
  appendAffectedSuppliersAgentReasoning,
} from "../../redux/slices/GlobalSlice";

// Streams /api/simulation/evaluate into Redux as soon as the external conditions
// land from /api/simulation/start. Renders nothing and is mounted above the step
// switcher, so the stream is never interrupted by the user navigating between
// steps (Step2 unmounts on "Go to supplier impact analysis" — this does not).
export default function EvaluationRunner() {
  const dispatch = useDispatch();
  const sessionId = useSelector((s) => s.Global.sessionId);
  const externalConditions = useSelector((s) => s.Global.externalConditions);
  const startedRef = useRef(false);

  useEffect(() => {
    if (!sessionId) return;                     // no session to evaluate against yet
    if (externalConditions.length === 0) return; // wait for /start to populate Redux
    if (startedRef.current) return;              // skip if a run has already started (Strict Mode's 2nd pass)
    startedRef.current = true;                   // set BEFORE any await — must stay synchronous

    async function runEvaluate() {
      try {
        const response = await fetch("/api/simulation/evaluate", {
          method: "POST",
          headers: { "X-Session-ID": sessionId },
        });

        if (!response.ok || !response.body) {
          throw new Error(`Evaluate failed: ${response.status}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          buffer = buffer.replace(/\r\n/g, "\n");
          const frames = buffer.split("\n\n");
          buffer = frames.pop();
          for (const frame of frames) {
            const line = frame.trim();
            if (line.startsWith("data:")) {
              const event = JSON.parse(line.slice(5).trim());
              console.log("[evaluate]", event.type);
              if (event.type === "agent_response") {
                dispatch(setAffectedSuppliers(event.data.suppliers || []));
              }
              dispatch(appendAffectedSuppliersAgentReasoning(event));
            }
          }
        }
      } catch (err) {
        console.error("[evaluate] stream error", err);
      }
    }

    runEvaluate();
  }, [sessionId, externalConditions, dispatch]);

  return null;
}
