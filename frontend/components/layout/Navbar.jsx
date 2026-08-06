"use client";

import { Navbar as BSNavbar, Container } from "react-bootstrap";
import { Badge } from "@leafygreen-ui/badge";
import { Subtitle, Body, InlineCode } from "@leafygreen-ui/typography";
import { useSelector } from "react-redux";

export default function Navbar() {
  const sessionId = useSelector((s) => s.Global.sessionId);
  return (
    <BSNavbar
      bg="white"
      className="border-bottom shadow-sm"
      style={{ height: 56, position: "sticky", top: 0, zIndex: 100 }}
    >
      <Container fluid className="px-4">
        <div className="d-flex flex-row align-items-center gap-2">
          <Subtitle style={{ color: "var(--mg-green)", letterSpacing: "-0.3px"}}>
            Intelligent Supplier Hub
          </Subtitle>
          <Badge variant="lightgray">This is a MongoDB demo</Badge>
        </div>
        <div>
          <Body style={{ fontSize: 16 }}>Session ID: <InlineCode style={{ fontSize: 16 }}>{sessionId?.slice(-4)}</InlineCode></Body>
        </div>
        
      </Container>
    </BSNavbar>
  );
}
