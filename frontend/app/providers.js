"use client";

import LeafyGreenProvider from "@leafygreen-ui/leafygreen-provider";
import ClientProvider from "./ClientProvider";

export function Providers({ children }) {
  return (
    <LeafyGreenProvider>
      <ClientProvider>{children}</ClientProvider>
    </LeafyGreenProvider>
  );
}
