"use client";

import {ExpandableCard} from "@leafygreen-ui/expandable-card";
import { spacing } from "@leafygreen-ui/tokens";

export default function BehindTheScenes() {
  return (
    <ExpandableCard
      title="Behind the Scenes"
      description="How MongoDB is perfect for multimodal search"
      defaultOpen={false}
      style={{ marginBottom: spacing[400] }}
    >
      Commming soon...
    </ExpandableCard>
  );
}
