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
  whyMDB,
}) {
  if (!docModel) return null;

  return (
    <Modal show={show} onHide={onHide} centered size="xl" >
      <Modal.Header
        closeButton
        style={{ borderBottom: `1px solid ${palette.gray.light2}` }}
      >
        <div className="d-flex align-items-center gap-2">
          <CurlyBraces /> <Subtitle>{title}</Subtitle>
        </div>
      </Modal.Header>
      <Modal.Body>
          {whyMDB && <WhyMongoDB>{whyMDB}</WhyMongoDB>}
          <br></br>
        <Code language="javascript" showLineNumbers={true} darkMode={true} copyButtonAppearance="persist">
          {JSON.stringify(docModel, null, 2)}
        </Code>
      </Modal.Body>
    </Modal>
  );
}
