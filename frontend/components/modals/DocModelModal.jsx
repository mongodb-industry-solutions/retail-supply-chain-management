"use client";

import { Modal } from "react-bootstrap";
import { palette } from "@leafygreen-ui/palette";
import CurlyBraces from "@leafygreen-ui/icon/dist/CurlyBraces";
import WhyMongoDB from "../shared/WhyMongoDB";
import { Code } from "@leafygreen-ui/code";
import { Subtitle } from "@leafygreen-ui/typography";

export default function DocModelModal({
  show,
  onHide,
  title,
  docModel,
}) {
  if (!docModel) return null;

  return (
    <Modal show={show} onHide={onHide} centered size="lg">
      <Modal.Header
        closeButton
        style={{ borderBottom: `1px solid ${palette.gray.light2}` }}
      >
        <div className="d-flex align-items-center gap-2">
          <CurlyBraces /> <Subtitle>{title}</Subtitle>
        </div>
      </Modal.Header>
      <Modal.Body>
        
          <WhyMongoDB>
            <strong>Automated Data Hygiene via TTL Indexes — </strong>
            Atlas uses Time-To-Live (TTL) indexes on the{" "}
            <code
              style={{
                fontFamily: "monospace",
                padding: "1px 5px",
                borderRadius: 3,
              }}
            >
              valid_until
            </code>{" "}
            field to automatically delete expired signals, ensuring the system
            returns to baseline without manual intervention when a disruption
            passes.
          </WhyMongoDB>
          <br></br>
        <Code language="javascript" showLineNumbers={true} darkMode={true} copyButtonAppearance="persist">
          {JSON.stringify(docModel, null, 2)}
        </Code>
      </Modal.Body>
    </Modal>
  );
}
