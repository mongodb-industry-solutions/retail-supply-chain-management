"use client";

import { useState, useEffect } from "react";
import { v4 as uuidv4 } from "uuid";
import { Provider, useDispatch } from "react-redux";
import { Body } from "@leafygreen-ui/typography";
import Button from "@leafygreen-ui/button";
import store from "../redux/store";
import { setSessionId, setExternalConditions } from "../redux/slices/GlobalSlice";
import EvaluationRunner from "../components/shared/EvaluationRunner";

function SessionInitializer({ children }) {
  const dispatch = useDispatch();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    const newSessionId = uuidv4();
    dispatch(setSessionId(newSessionId));

    fetch("/api/simulation/start", {
      method: "POST",
      headers: { "X-Session-ID": newSessionId },
    })
      .then((res) => {
        if (!res.ok) throw new Error(`Server error: ${res.status}`);
        return res.json();
      })
      .then((data) => {
        dispatch(setExternalConditions(data.signals));
        setReady(true);
      })
      .catch(() => setError(true));
  }, [dispatch]);

  if (error) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100vh",
          gap: 16,
        }}
      >
        <Body>
          Something went wrong initializing the session. Please refresh the page.
        </Body>
        <Button variant="primary" onClick={() => window.location.reload()}>
          Refresh
        </Button>
      </div>
    );
  }

  if (!ready) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100vh",
        }}
      >
        <Body>Generating new session...</Body>
      </div>
    );
  }

  return children;
}

export default function ClientProvider({ children }) {
  return (
    <Provider store={store}>
      <SessionInitializer>
        <EvaluationRunner />
        {children}
      </SessionInitializer>
    </Provider>
  );
}
