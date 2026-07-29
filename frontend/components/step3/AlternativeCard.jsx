"use client";

import Accordion from "react-bootstrap/Accordion";
import { Card } from "@leafygreen-ui/card";
import Button from "@leafygreen-ui/button";
import { Badge } from "@leafygreen-ui/badge";
import { Body, Overline } from "@leafygreen-ui/typography";
import Icon from "@leafygreen-ui/icon";
import { palette } from "@leafygreen-ui/palette";
import { spacing } from "@leafygreen-ui/tokens";
import { useDispatch } from "react-redux";
import SupplierTitle from "../shared/SupplierTitle";
import { setCertOpened } from "@/redux/slices/GlobalSlice";
import { Code, Panel } from "@leafygreen-ui/code";
import { InfoSprinkle } from "@leafygreen-ui/info-sprinkle";
import Tooltip from "@leafygreen-ui/tooltip";
import ReadMore from "../shared/ReadMore";

function RRFBar({ textScore, vectorScore }) {
  const total = textScore + vectorScore;
  const textPct = Math.round((textScore / total) * 100);
  const vecPct = 100 - textPct;
  return (
    <div style={{ minWidth: 170 }}>
      <div className="d-flex justify-content-between mb-1">
        <span style={{ fontSize: 10, fontWeight: 600, color: "#0284c7" }}>
          Text {textPct}%
        </span>
        <span
          style={{ fontSize: 10, fontWeight: 600, color: palette.green.dark2 }}
        >
          Vector {vecPct}%
        </span>
      </div>
      <div
        style={{
          height: 6,
          borderRadius: 3,
          overflow: "hidden",
          display: "flex",
          background: palette.gray.light2,
        }}
      >
        <div
          style={{
            width: `${textPct}%`,
            background: "#0284c7",
            transition: "width 0.6s ease",
          }}
        />
        <div
          style={{
            width: `${vecPct}%`,
            background: palette.green.dark1,
            transition: "width 0.6s ease",
          }}
        />
      </div>
      <div className="d-flex justify-content-between mt-1">
        <span
          style={{
            fontSize: 10,
            color: palette.gray.base,
            fontFamily: "monospace",
          }}
        >
          {textScore.toFixed(4)}
        </span>
        <span
          style={{
            fontSize: 10,
            color: palette.gray.base,
            fontFamily: "monospace",
          }}
        >
          {vectorScore.toFixed(4)}
        </span>
      </div>
    </div>
  );
}

const EXT_COLOR = {
  PDF: { variant: "red" },
  TXT: { variant: "blue" },
  IMG: { variant: "yellow" },
  PNG: { variant: "yellow" },
  JSON: { variant: "darkgray" },
};

function ExtBadge({ ext }) {
  const cfg = EXT_COLOR[ext] ?? { variant: "lightgray" };
  return (
    <Badge className="d-flex me-2" variant={cfg.variant}>
      {ext}
    </Badge>
  );
}

function EvidenceHeader({ passed, title, exts, glossary = null }) {
  return (
    <div className="d-flex align-items-center gap-2" style={{ minWidth: 0 }}>
      <Icon
        glyph={passed ? "CheckmarkWithCircle" : "XWithCircle"}
        style={{
          color: passed ? palette.green.base : palette.red.base,
          flexShrink: 0,
        }}
      />
      <span style={{ flex: 1, fontSize: 14, fontWeight: 500 }}>{title}</span>
      {glossary && (
        <Tooltip
          trigger={
            <span
              role="img"
              aria-label={`${title} info`}
              className="d-inline-flex"
              style={{ color: palette.gray.base }}
            >
              <Icon glyph="InfoWithCircle" />
            </span>
          }
        >
          {glossary?.definition}
        </Tooltip>
      )}
      <div className="d-flex me-2">
        {exts.map((ext) => (
          <ExtBadge key={ext} ext={ext} />
        ))}
      </div>
    </div>
  );
}

const STATS = (s) => [
  {
    label: "Proximity",
    value: `${s.proximity_km}kms`,
    glossaryName: "proximity_km",
  },
  { label: "Category", value: s.category },
  {
    label: "Coverage",
    value: `${s.evidence_coverage.criteria_verified}/${s.evidence_coverage.criteria_total}`,
    glossaryName: "criteria_verified", // not using evidence_coverage
  },
  {
    label: "Summary",
    value: s.precedent_summary ? s.precedent_summary : "N/A",
  },
];

export default function AlternativeCard({ supplier, isFirst, onEscalate }) {
  const dispatch = useDispatch();
  return (
    <Card className="AlternativeCard" style={{ marginBottom: spacing[400] }}>
      {/* ── Header ── */}
      <div className="d-flex align-items-start justify-content-between gap-3 mb-3">
        <div className="d-flex flex-column">
          <div className="d-flex align-items-center gap-2">
            <SupplierTitle name={supplier.supplier_name} />
            {isFirst && <Badge variant="green">Top Match</Badge>}
          </div>
          <Body style={{ fontSize: 12, color: palette.gray.dark1, margin: 0 }}>
            📍 {supplier.location} · {supplier.category}
          </Body>
        </div>

        {/* <div className="d-flex flex-column align-items-end gap-2" style={{ flexShrink: 0 }}>
          <div
            className="d-flex align-items-center gap-1"
            style={{ background: palette.gray.light3, borderRadius: 20, padding: "4px 12px" }}
          >
            <span>⭐</span>
            <code style={{ fontSize: 13, fontWeight: 700 }}>{supplier.rrfScore.toFixed(4)}</code>
          </div>
          <RRFBar textScore={supplier.textScore} vectorScore={supplier.vectorScore} />
        </div> */}
      </div>
            {/* ── Why multimodal ── */}
      <div style={{ marginBottom: spacing[300] }}>
        <Overline
          style={{
            color: palette.gray.dark1,
            display: "block",
            marginBottom: spacing[100],
          }}
        >
          Instead of manually cross-referencing PDFs, spreadsheets and emails,
          multimodal search allows users to query unstructured data directly.
        </Overline>
      </div>

      {/* ── Stats ── */}
      <div
        className="row g-0 mb-3 text-center"
        style={{
          background: palette.gray.light3,
          borderRadius: 10,
          padding: `${spacing[300]}px 0`,
        }}
      >
        {STATS(supplier).map((stat) => (
          <div key={stat.label} className="col-3">
            <div className="d-flex align-items-center justify-content-center gap-1 mb-1">
              <Overline
                style={{
                  color: palette.gray.base,
                  display: "block",
                  marginBottom: 2,
                }}
              >
                {stat.label}
              </Overline>
              {stat.glossaryName && (
                <InfoSprinkle
                  triggerProps={{
                    onMouseDown: () => {},
                    onMouseOver: () => {},
                    "aria-label": "aria-label",
                  }}
                >
                  {
                    supplier.glossary.find(
                      (term) => term.term === stat.glossaryName,
                    )?.definition
                  }
                </InfoSprinkle>
              )}
            </div>

            <Body
              weight="medium"
              style={{
                color: stat.good ? palette.green.dark2 : palette.gray.dark3,
                margin: 0,
              }}
            >
              {stat.value}
            </Body>
          </div>
        ))}
      </div>

      {/* ── Rationale (narrative prose) + structured glossary ── */}
      {supplier.rationale && (
         <ReadMore text={supplier.rationale} />
        // <div style={{ marginBottom: spacing[300] }}>
        //   <Body
        //     style={{
        //       fontSize: 14,
        //       color: palette.gray.dark2,
        //     }}
        //   >
        //     {supplier.rationale}
        //   </Body>
        // </div>
      )}

      {/* ── Evidence checks ── */}
      <Accordion className="mb-3">
        {supplier.criteria.map((criteria) => {
          return (
            <Accordion.Item
              key={criteria.criterion}
              eventKey={criteria.criterion}
            >
              <Accordion.Header>
                <EvidenceHeader
                  passed={criteria.status === "compliant"}
                  title={criteria.criterion.replaceAll("_", " ")}
                  glossary={
                    supplier.glossary.find(
                      (term) => term.term === criteria.criterion,
                    ) || null
                  }
                  exts={
                    criteria?.citation?.source_file
                      ? [
                          criteria?.citation?.source_file
                            ?.split(".")
                            .pop()
                            ?.toUpperCase(),
                        ]
                      : []
                  }
                />
              </Accordion.Header>
              <Accordion.Body>
                {criteria.status !== "unknown" && (
                  <>
                    <div className="d-flex align-items-center gap-2 mt-1 mb-2">
                      <div
                        style={{
                          background: palette.gray.light3,
                          borderRadius: 8,
                          padding: `0px 1rem`,
                        }}
                      >
                        <Overline
                          style={{ margin: 0, color: palette.gray.dark1 }}
                        >
                          {criteria?.citation?.source_file}
                        </Overline>
                      </div>
                      <div
                        style={{
                          background: palette.gray.light3,
                          borderRadius: 8,
                          padding: `0px 1rem`,
                        }}
                      >
                        <Overline
                          style={{ margin: 0, color: palette.gray.dark1 }}
                        >
                          Page {criteria?.citation?.page}
                        </Overline>
                      </div>
                      <div
                        style={{
                          background: palette.gray.light3,
                          borderRadius: 8,
                          padding: `0px 1rem`,
                        }}
                      >
                        <Overline
                          style={{ margin: 0, color: palette.gray.dark1 }}
                        >
                          Type {criteria?.citation?.doc_type}
                        </Overline>
                      </div>
                    </div>
                    <div
                      className="mb-2"
                      style={{
                        background: palette.gray.light3,
                        borderRadius: 8,
                        padding: `0px 1rem`,
                      }}
                    >
                      <Body>{criteria?.note}</Body>
                    </div>
                    <Code
                      language="none"
                      panel={<Panel title="Chunk evidence" />}
                    >
                      {criteria?.citation?.excerpt}
                    </Code>
                    <Button
                      className="mt-2"
                      size="small"
                      variant="primaryOutline"
                      leftGlyph={<Icon glyph="CurlyBraces" />}
                      onClick={() => dispatch(setCertOpened(criteria))}
                    >
                      View document model
                    </Button>
                  </>
                )}
              </Accordion.Body>
            </Accordion.Item>
          );
        })}
      </Accordion>

      {/* ── Footer ── */}
      <div
        className="d-flex justify-content-end pt-3"
        style={{ borderTop: `1px solid ${palette.gray.light2}` }}
      >
        <Button variant="primary" onClick={onEscalate}>
          Select
        </Button>
      </div>
    </Card>
  );
}
