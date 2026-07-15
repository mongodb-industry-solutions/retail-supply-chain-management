"use client";

import { useSelector, useDispatch } from "react-redux";
import { Modal } from "react-bootstrap";
import { Body, Overline } from "@leafygreen-ui/typography";
import Icon from "@leafygreen-ui/icon";
import { Code } from "@leafygreen-ui/code";
import { palette } from "@leafygreen-ui/palette";
import { spacing } from "@leafygreen-ui/tokens";

import WhyMongoDB from "../shared/WhyMongoDB";
import { setCertOpened } from "@/redux/slices/GlobalSlice";

export default function CertModal() {
  const dispatch = useDispatch();
  const certOpened = useSelector((s) => s.Global.certOpened);

  const onHide = () => dispatch(setCertOpened(null));

  return (
    <Modal show={!!certOpened} onHide={onHide} centered size="lg">
      <Modal.Header closeButton>
        <div className="d-flex align-items-center gap-2">
          <Icon glyph="CurlyBraces" />
          <span style={{ fontWeight: 700 }}>
            {certOpened?.criterion?.replaceAll("_", " ")} — Document Model
          </span>
        </div>
      </Modal.Header>
      <Modal.Body>
        <WhyMongoDB>
          By converting unstructured data types into high-dimensional vectors,{" "}
          <strong>multimodal search</strong> allows users to find information
          based on semantic meaning and intent — not just keyword matches.
        </WhyMongoDB>

        <div
          className="d-flex align-items-center gap-2 mt-3 mb-3"
          style={{
            background: palette.gray.light3,
            borderRadius: 8,
            padding: `${spacing[200]}px ${spacing[300]}px`,
          }}
        >
          <Icon
            glyph="File"
            size="small"
            style={{ color: palette.gray.dark1 }}
          />
          <Overline style={{ margin: 0, color: palette.gray.dark1 }}>
            {certOpened?.citation?.source_file}
          </Overline>
        </div>

        <Body
          style={{
            fontStyle: "italic",
            color: palette.gray.dark1,
            marginBottom: spacing[300],
            lineHeight: 1.6,
          }}
        >
          {certOpened?.excerpt}
        </Body>

        <Code
          language="json"
          showLineNumbers
          darkMode
          copyButtonAppearance="persist"
        >
          {JSON.stringify(certOpened?.citation ?? {}, null, 2)}
        </Code>
      </Modal.Body>
    </Modal>
  );
}
