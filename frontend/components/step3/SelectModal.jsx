"use client";

import { Modal } from "react-bootstrap";
import Button from "@leafygreen-ui/button";
import { Body, Subtitle } from "@leafygreen-ui/typography";
import { palette } from "@leafygreen-ui/palette";
import { spacing } from "@leafygreen-ui/tokens";

import WhyMongoDB from "../shared/WhyMongoDB";

export default function SelectModal({ show, onHide }) {
  return (
    <Modal show={show} onHide={onHide} size="lg" centered>
      <Modal.Header
        closeButton
        style={{ background: palette.green.dark1, borderBottom: "none" }}
      >
        <Subtitle style={{ color: "#fff", margin: 0 }}>
          🎉 You Just Closed a Real Risk — With Evidence, Not Guesswork
        </Subtitle>
      </Modal.Header>
      <Modal.Body style={{ padding: spacing[500] }}>
        <Body style={{ lineHeight: 1.7, marginBottom: spacing[300] }}>
          In seconds, the system caught a live disruption, found a qualified
          alternative, and gave you a decision you could actually trust —
          backed by real certificates and contract terms, not a black-box
          score.
        </Body>

        <Body
          weight="medium"
          style={{ display: "block", marginBottom: spacing[100] }}
        >
          Closing the Loop: This Is How the System Gets Smarter Over Time
        </Body>
        <Body style={{ lineHeight: 1.7, marginBottom: spacing[300] }}>
          A decision like the one you just made is exactly what feeds the
          system&apos;s memory. Every real, resolved outcome is designed to
          write back into{" "}
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
          as a new episode — so the next time a similar disruption hits,
          anywhere in the network, the system doesn&apos;t start from zero. It
          remembers.
        </Body>

        <WhyMongoDB title="🍃 Why MongoDB">
          <span style={{ display: "block", marginBottom: spacing[200] }}>
            This works because supplier documents, risk history, and precedent
            memory all live on one platform, with Voyage AI embeddings that
            Atlas keeps in sync automatically. You just watched that pay off:
            the risk score
            behind this alert and the evidence behind this shortlist both came
            from real-time vector search over real data — no separate vector
            database, no sync jobs, nothing to drift out of date.
          </span>
          <span style={{ display: "block" }}>
            That&apos;s the real unlock. Teaching the system to learn from
            outcomes like this one isn&apos;t a new system to bolt on —
            it&apos;s one more write to a collection that&apos;s already there,
            already indexed, already trusted by every agent reading from it.
            One platform. Every layer gets smarter, together.
          </span>
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
