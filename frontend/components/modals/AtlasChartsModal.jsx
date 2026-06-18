"use client";

import Image from "next/image";
import { Modal } from "react-bootstrap";
import { H3, Body, Subtitle } from "@leafygreen-ui/typography";
import { OrderedList, OrderedListItem } from "@leafygreen-ui/ordered-list";
import { palette } from "@leafygreen-ui/palette";
import { spacing } from "@leafygreen-ui/tokens";

const atlasCustomers = [
  {
    name: "Keller Williams",
    url: "https://www.mongodb.com/solutions/customer-case-studies/keller-williams",
    desc: "Uses MongoDB Charts to monitor data ingestion and provide product managers self-serve visibility into usage and agent-related activity. ",
  },
  {
    name: "Meltwater",
    url: "https://www.mongodb.com/solutions/customer-case-studies/meltwater",
    desc: "Uses MongoDB Atlas and Charts for product metrics and faster, data-driven development. The case study says direct database-connected visualizations were a reason they chose MongoDB Charts and Atlas.",
  },
  {
    name: "Acxiom",
    url: "https://www.mongodb.com/solutions/customer-case-studies/acxiom",
    desc: "Uses Charts dashboards for operational intelligence, request latency monitoring, engineering performance visibility, and cloud cost visualization with Data Federation.",
  },
];

const highlights = [
  "Build modern experiences with embedded analytics",
  "Enable data-driven decision-making",
  "Power insights across your organization",
];

export default function AtlasChartsModal({ show, onHide }) {
  return (
    <Modal show={show} onHide={onHide} centered size="lg">
      <Modal.Header closeButton>
        <div className="d-flex align-items-center gap-3">
          <div
            style={{
              background: palette.green.light3,
              borderRadius: 10,
              width: 40,
              height: 40,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Image
              src="/images/icons/atlas-charts.png"
              alt="Atlas Charts"
              width={28}
              height={28}
            />
          </div>
          <div>
            <H3 style={{ margin: 0 }}>Atlas Charts</H3>
            <Body style={{ color: palette.gray.base, margin: 0, fontSize: 15 }}>
              MongoDB&apos;s embedded analytics platform
            </Body>
          </div>
        </div>
      </Modal.Header>

      <Modal.Body style={{ padding: spacing[600] }}>
        {/* Intro */}
        <Body style={{ color: palette.gray.dark2, marginBottom: spacing[400], fontSize: 15 }}>
          Meet{" "}
          <a
            href="https://www.mongodb.com/products/platform/atlas-charts"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: palette.green.dark2, fontWeight: 600 }}
          >
            Atlas Charts
          </a>
          , MongoDB&apos;s built-in business intelligence and data visualization tool within Atlas.
        </Body>

        {/* Highlights */}
        <div style={{ marginBottom: spacing[600] }}>
          <OrderedList>
            {highlights.map((text, i) => (
              <OrderedListItem key={i} description={<span style={{ fontSize: 15 }}>{text}</span>} />
            ))}
          </OrderedList>
        </div>

        <hr />

        {/* Customer stories */}
        <div>
          <Body
            style={{
              fontSize: 13,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.07em",
              color: palette.gray.base,
              marginBottom: spacing[100],
            }}
          >
            ⭐ Customer Stories
          </Body>
          <Subtitle style={{ marginBottom: spacing[400] }}>
            See who is leveraging Atlas Charts power in their teams right now
          </Subtitle>
          <div className="d-flex flex-column gap-2">
            {atlasCustomers.map((c) => (
              <a
                key={c.name}
                href={c.url}
                target="_blank"
                rel="noopener noreferrer"
                className="d-flex align-items-center justify-content-between"
                style={{
                  padding: `${spacing[200]}px ${spacing[400]}px`,
                  background: palette.green.light3,
                  border: `1px solid ${palette.green.light2}`,
                  borderRadius: 10,
                  textDecoration: "none",
                }}
              >
                <div className="d-flex align-items-center gap-2">
                  <Image
                    src="/images/icons/atlas-charts.png"
                    alt="Atlas Charts"
                    width={28}
                    height={28}
                    style={{ flexShrink: 0 }}
                  />
                  <div>
                    <Body weight="medium" style={{ color: palette.gray.dark3, margin: 0, fontSize: 15 }}>
                      {c.name}
                    </Body>
                    <Body style={{ color: palette.gray.dark1, fontSize: 14, margin: 0 }}>
                      {c.desc}
                    </Body>
                  </div>
                </div>
                <span style={{ color: palette.green.dark2, fontWeight: 600 }}>→</span>
              </a>
            ))}
          </div>
        </div>
      </Modal.Body>
    </Modal>
  );
}
