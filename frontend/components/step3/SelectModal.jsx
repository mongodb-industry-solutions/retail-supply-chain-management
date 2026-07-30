"use client";

import { Modal } from "react-bootstrap";
import Button from "@leafygreen-ui/button";
import { Body, Subtitle } from "@leafygreen-ui/typography";
import { palette } from "@leafygreen-ui/palette";
import { spacing } from "@leafygreen-ui/tokens";

import WhyMongoDB from "../shared/WhyMongoDB";

export default function SelectModal({ show, onHide }) {
  return (
    <Modal show={show} onHide={onHide} centered>
      <Modal.Header
        closeButton
        style={{ background: palette.green.dark1, borderBottom: "none" }}
      >
        <Subtitle style={{ color: "#fff", margin: 0 }}>
          🎉 Congratulations!
        </Subtitle>
      </Modal.Header>
      <Modal.Body style={{ padding: spacing[500] }}>
        <Body style={{ lineHeight: 1.7, marginBottom: spacing[300] }}>
          You just ensured the{" "}
          <strong>business remains operationally agile</strong> in the face of
          external conditions — identifying alternative suppliers through
          semantic discovery and multimodal search.
        </Body>

        <Body
          weight="medium"
          style={{ display: "block", marginBottom: spacing[100] }}
        >
          Closing the Loop: Enriching the System&apos;s Memory
        </Body>
        <Body style={{ lineHeight: 1.7, marginBottom: spacing[300] }}>
          Your decision is written back into the{" "}
          <code
            style={{
              background: palette.gray.light3,
              padding: "1px 5px",
              borderRadius: 3,
              fontFamily: "monospace",
            }}
          >
            agent_memory
          </code>{" "}
          collection as a new embedded episode, completely closing the learning
          loop.
        </Body>

        <WhyMongoDB>
          Because the system uses <strong>Voyage AI embeddings</strong>, the next
          time a similar external condition strikes the agent will retrieve this
          exact episode via <strong>Vector Search</strong> and automatically
          adjust the{" "}
          <code style={{ fontFamily: "monospace" }}>historical_weight</code>{" "}
          during real-time risk calculations. Every human approval enriches the
          system&apos;s memory.
        </WhyMongoDB>

        <div className="d-flex justify-content-end mt-3">
          <Button variant="primary" onClick={onHide}>
            Got it 👍
          </Button>
        </div>
      </Modal.Body>
    </Modal>
  );
}
