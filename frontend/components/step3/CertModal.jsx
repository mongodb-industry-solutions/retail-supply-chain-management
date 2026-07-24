"use client";

import { useState } from "react";
import { useSelector, useDispatch } from "react-redux";
import { Modal } from "react-bootstrap";
import Button from "@leafygreen-ui/button";
import { Badge } from "@leafygreen-ui/badge";
import { Body, Overline } from "@leafygreen-ui/typography";
import Icon from "@leafygreen-ui/icon";
import { Code } from "@leafygreen-ui/code";
import { palette } from "@leafygreen-ui/palette";
import { spacing } from "@leafygreen-ui/tokens";

import WhyMongoDB from "../shared/WhyMongoDB";
import { setCertOpened } from "@/redux/slices/GlobalSlice";

// The source files don't exist — we reconstruct a representative document
// from the genuine cited `excerpt` and its metadata.

function Highlight({ children }) {
  return (
    <mark
      style={{
        background: palette.yellow.light2,
        borderRadius: 3,
        padding: "1px 2px",
        boxDecorationBreak: "clone",
        WebkitBoxDecorationBreak: "clone",
      }}
    >
      {children}
    </mark>
  );
}

function SimulatedBadge() {
  return (
    <Badge variant="yellow" className="d-flex align-items-center gap-1">
      <Icon glyph="Beaker" size="small" /> Simulated
    </Badge>
  );
}

// Emails embed "From: … | To: … | Date: … | Subject: …. <body>" in the excerpt.
function parseEmail(excerpt = "") {
  const parts = excerpt.split(" | ");
  const headers = {};
  let body = "";
  parts.forEach((part) => {
    const m = part.match(/^(From|To|Date|Subject):\s*([\s\S]*)$/);
    if (!m) {
      body = body ? `${body} ${part}` : part;
      return;
    }
    if (m[1] === "Subject") {
      const idx = m[2].indexOf(". ");
      if (idx !== -1) {
        headers.Subject = m[2].slice(0, idx);
        body = m[2].slice(idx + 2);
      } else {
        headers.Subject = m[2];
      }
    } else {
      headers[m[1]] = m[2];
    }
  });
  if (!headers.From && !body) body = excerpt;
  return { headers, body };
}

function EmailSkin({ citation }) {
  const { headers, body } = parseEmail(citation?.excerpt);
  const rows = [
    ["From", headers.From],
    ["To", headers.To],
    ["Date", headers.Date],
  ].filter(([, v]) => v);

  return (
    <div
      style={{
        border: `1px solid ${palette.gray.light1}`,
        borderRadius: 10,
        overflow: "hidden",
        background: palette.white,
      }}
    >
      <div
        className="d-flex align-items-center justify-content-between"
        style={{
          background: palette.gray.light3,
          padding: `${spacing[200]}px ${spacing[300]}px`,
          borderBottom: `1px solid ${palette.gray.light1}`,
        }}
      >
        <div className="d-flex align-items-center gap-2">
          <Icon glyph="Email" style={{ color: palette.gray.dark1 }} />
          <Overline style={{ margin: 0, color: palette.gray.dark1 }}>
            {citation?.source_file}
          </Overline>
        </div>
        <SimulatedBadge />
      </div>

      <div style={{ padding: spacing[400] }}>
        <Body
          weight="medium"
          style={{ fontSize: 18, color: palette.black, marginBottom: spacing[300] }}
        >
          {headers.Subject ?? "(no subject)"}
        </Body>

        <div style={{ marginBottom: spacing[300] }}>
          {rows.map(([label, value]) => (
            <div key={label} className="d-flex gap-2" style={{ fontSize: 13 }}>
              <span
                style={{
                  color: palette.gray.base,
                  width: 44,
                  flexShrink: 0,
                  textAlign: "right",
                }}
              >
                {label}
              </span>
              <span style={{ color: palette.gray.dark2 }}>{value}</span>
            </div>
          ))}
        </div>

        <div
          style={{
            borderTop: `1px solid ${palette.gray.light2}`,
            paddingTop: spacing[300],
            lineHeight: 1.7,
            color: palette.gray.dark3,
            fontSize: 14,
          }}
        >
          <Highlight>{body}</Highlight>
        </div>
      </div>
    </div>
  );
}

const DOC_TITLE = {
  certificate: "Certificate",
  contract: "Contract",
  sustainability_report: "Sustainability Report",
};

// Generic filler so the cited excerpt looks embedded in a fuller page.
const FILLER = [
  "This document is issued in accordance with the applicable standard and remains subject to the terms, scope, and conditions set out herein.",
  "The information recorded below has been verified by the certifying body against the producer's declared operations and supporting records on file.",
  "Any reproduction of this document must retain all references, identifiers, and validity information in full and without alteration.",
  "Continued conformance is contingent on periodic surveillance and the maintenance of the management systems described in the referenced annexes.",
  "For verification of authenticity, refer to the issuing authority quoting the certificate or reference number shown on this page.",
];

function BlurredLines({ lines }) {
  return (
    <div
      aria-hidden
      style={{
        filter: "blur(3px)",
        opacity: 0.5,
        userSelect: "none",
        pointerEvents: "none",
      }}
    >
      {lines.map((line, i) => (
        <p key={i} style={{ margin: "0 0 10px" }}>
          {line}
        </p>
      ))}
    </div>
  );
}

function PaperSkin({ citation }) {
  const label =
    DOC_TITLE[citation?.doc_type] ??
    (citation?.doc_type ?? "Document").replaceAll("_", " ");

  return (
    <div
      style={{
        background: palette.gray.light2,
        borderRadius: 10,
        padding: spacing[400],
      }}
    >
      <div
        style={{
          background: palette.white,
          borderRadius: 4,
          boxShadow: "0 4px 16px rgba(0,0,0,0.18)",
          padding: `${spacing[500]}px ${spacing[600]}px`,
          maxWidth: 620,
          margin: "0 auto",
          minHeight: 360,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div className="d-flex align-items-center justify-content-between">
          <div className="d-flex align-items-center gap-2">
            <Icon glyph="File" style={{ color: palette.green.dark2 }} />
            <span
              style={{
                fontWeight: 700,
                letterSpacing: 1,
                textTransform: "uppercase",
                color: palette.gray.dark3,
              }}
            >
              {label}
            </span>
          </div>
          <SimulatedBadge />
        </div>

        <div
          style={{
            height: 2,
            background: palette.green.dark2,
            margin: `${spacing[300]}px 0 ${spacing[400]}px`,
          }}
        />

        <div
          style={{
            fontFamily: "Georgia, 'Times New Roman', serif",
            lineHeight: 1.9,
            fontSize: 14,
            color: palette.gray.dark3,
            flex: 1,
          }}
        >
          <BlurredLines lines={FILLER.slice(0, 2)} />
          <p style={{ margin: "0 0 10px" }}>
            <Highlight>{citation?.excerpt}</Highlight>
          </p>
          <BlurredLines lines={FILLER.slice(2)} />
        </div>

        {citation?.valid_until && (
          <Body
            style={{
              marginTop: spacing[400],
              color: palette.gray.dark1,
              fontSize: 13,
            }}
          >
            Valid until {String(citation.valid_until).slice(0, 10)}
          </Body>
        )}

        <div
          className="d-flex justify-content-between"
          style={{
            marginTop: spacing[400],
            paddingTop: spacing[200],
            borderTop: `1px solid ${palette.gray.light2}`,
            fontSize: 11,
            color: palette.gray.base,
          }}
        >
          <span>{citation?.source_file}</span>
          {citation?.page != null && <span>Page {citation.page}</span>}
        </div>
      </div>
    </div>
  );
}

function SimulatedDocument({ citation }) {
  if (citation?.doc_type === "email") return <EmailSkin citation={citation} />;
  return <PaperSkin citation={citation} />;
}

export default function CertModal() {
  const dispatch = useDispatch();
  const certOpened = useSelector((s) => s.Global.certOpened);
  const [view, setView] = useState("model");

  const onHide = () => dispatch(setCertOpened(null));
  const citation = certOpened?.citation;

  return (
    <Modal
      show={!!certOpened}
      onHide={onHide}
      onEntered={() => setView("model")}
      centered
      size="lg"
    >
      <Modal.Header closeButton>
        <div className="d-flex align-items-center gap-2">
          <Icon glyph="File" />
          <span style={{ fontWeight: 700 }}>
            {certOpened?.criterion?.replaceAll("_", " ")}
          </span>
        </div>
      </Modal.Header>
      <Modal.Body>
        <WhyMongoDB>
          By converting unstructured data types into high-dimensional vectors,{" "}
          <strong>multimodal search</strong> allows users to find information
          based on semantic meaning and intent — not just keyword matches.
        </WhyMongoDB>

        <div className="d-flex gap-2 mt-3 mb-3">
          <Button
            size="small"
            variant={view === "model" ? "primary" : "default"}
            leftGlyph={<Icon glyph="CurlyBraces" />}
            onClick={() => setView("model")}
          >
            Model
          </Button>
          <Button
            size="small"
            variant={view === "document" ? "primary" : "default"}
            leftGlyph={<Icon glyph="File" />}
            onClick={() => setView("document")}
          >
            Document
          </Button>
        </div>

        {view === "document" ? (
          <SimulatedDocument citation={citation} />
        ) : (
          <Code
            language="json"
            showLineNumbers
            darkMode
            copyButtonAppearance="persist"
          >
            {JSON.stringify(citation ?? {}, null, 2)}
          </Code>
        )}
      </Modal.Body>
    </Modal>
  );
}