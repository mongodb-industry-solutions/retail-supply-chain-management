"use client";

import { useState, useEffect } from "react";
import { Card } from "@leafygreen-ui/card";
import { Badge } from "@leafygreen-ui/badge";
import Button from "@leafygreen-ui/button";
import Icon from "@leafygreen-ui/icon";
import { spacing } from "@leafygreen-ui/tokens";
import SectionHeader from "../shared/SectionHeader";
import AtlasChartsModal from "../modals/AtlasChartsModal";
import { createDashboardUrl } from "../../utils/atlasCharts";

export default function DashboardAtlasCharts() {
  const [modalOpen, setModalOpen] = useState(false);
  const [dashboardUrl, setDashboardUrl] = useState("");

  useEffect(() => {
    fetch("/api/charts-config")
      .then((res) => res.json())
      .then(({ baseUrl, dashboardId }) => {
        if (baseUrl && dashboardId) {
          setDashboardUrl(createDashboardUrl(baseUrl, dashboardId));
        }
      });
  }, []);

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
        { dashboardUrl &&
          <iframe
            style={{
              width: "100%",
              height: "900px",
              border: "none",
              display: "block",
            }}
            loading="lazy"
            title="Atlas Charts Dashboard"
            src={dashboardUrl}
          />
        }
      </Card>
    </>
  );
}
