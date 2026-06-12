"use client";

import { Navbar as BSNavbar, Container, Badge } from "react-bootstrap";

export default function Navbar() {
  return (
    <BSNavbar
      bg="white"
      className="border-bottom shadow-sm"
      style={{ height: 56, position: "sticky", top: 0, zIndex: 100 }}
    >
      <Container fluid className="px-4">
        <BSNavbar.Brand
          style={{ fontSize: 16, fontWeight: 700, color: "var(--mg-green)", letterSpacing: "-0.3px" }}
        >
          Intelligent Supplier Hub
        </BSNavbar.Brand>
        <Badge>
          This is a MongoDB demo
        </Badge>
      </Container>
    </BSNavbar>
  );
}
