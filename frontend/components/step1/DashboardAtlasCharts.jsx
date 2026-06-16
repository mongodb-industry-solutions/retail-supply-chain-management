"use client";

import { useState } from "react";
import { Card } from "@leafygreen-ui/card";
import { Badge } from "@leafygreen-ui/badge";
import Button from "@leafygreen-ui/button";
import Icon from "@leafygreen-ui/icon";
import { spacing } from "@leafygreen-ui/tokens";
import SectionHeader from "../shared/SectionHeader";
import AtlasChartsModal from "../modals/AtlasChartsModal";

export default function DashboardAtlasCharts() {
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <>
      <AtlasChartsModal show={modalOpen} onHide={() => setModalOpen(false)} />
      <SectionHeader
        title="Dashboard"
        subtitle={
          <>
            Leverage{" "}
            <a
              href="https://www.mongodb.com/products/platform/atlas-charts"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "var(--mg-green)", fontWeight: 600 }}
            >
              Atlas Charts
            </a>{" "}
            to visualize your data embedded in any platform you need.
          </>
        }
        badge={<Badge variant="green">Powered by Atlas Charts</Badge>}
        rightElement={
          <Button
            size="small"
            variant="default"
            leftGlyph={<Icon glyph="Wizard" />}
            onClick={() => setModalOpen(true)}
          >
            Learn More
          </Button>
        }
      />
      <Card style={{ padding: spacing[400], marginBottom: spacing[400] }}>
        <div className="row g-3 m-4">Comming soon...</div>
      </Card>
    </>
  );
}
