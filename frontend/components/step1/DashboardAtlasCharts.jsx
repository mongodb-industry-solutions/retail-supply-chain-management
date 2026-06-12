"use client";

import { useState } from "react";
import {Card} from "@leafygreen-ui/card";
import {Badge} from "@leafygreen-ui/badge";
import Button from "@leafygreen-ui/button";
import { spacing } from "@leafygreen-ui/tokens";
import SectionHeader from "../shared/SectionHeader";
import AtlasChartsModal from "../modals/AtlasChartsModal";

export default function DashboardAtlasCharts() {
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <>
      <AtlasChartsModal show={modalOpen} onHide={() => setModalOpen(false)} />
      <Card style={{ padding: spacing[400], marginBottom: spacing[400] }}>
        <div className="d-flex align-items-start justify-content-between mb-3">
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
                </a>
                {" "}to visualize your data embedded in any platform you need.
              </>
            }
          />
          <div className="d-flex align-items-center gap-2">
            <Badge variant="green">Powered by Atlas Charts</Badge>
            <Button size="small" variant="default" onClick={() => setModalOpen(true)}>
              ✨ Learn More
            </Button>
          </div>
        </div>

        <div className="row g-3">
          Comming soon...
        </div>
      </Card>
    </>
  );
}
