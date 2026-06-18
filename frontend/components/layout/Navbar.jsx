"use client";

import { Navbar as BSNavbar, Container } from "react-bootstrap";
import { Badge } from "@leafygreen-ui/badge";
import { Subtitle } from "@leafygreen-ui/typography";

export default function Navbar() {
  return (
    <BSNavbar
      bg="white"
      className="border-bottom shadow-sm"
      style={{ height: 56, position: "sticky", top: 0, zIndex: 100 }}
    >
      <Container fluid className="px-4">
        <BSNavbar.Brand>
          <Subtitle style={{ color: "var(--mg-green)", letterSpacing: "-0.3px", margin: 0 }}>
            Intelligent Supplier Hub
          </Subtitle>
        </BSNavbar.Brand>
        <Badge variant="lightgray">This is a MongoDB demo</Badge>
      </Container>
    </BSNavbar>
  );
}
