"use client";

import { useSelector } from "react-redux";
import { Body } from "@leafygreen-ui/typography";
import { palette } from "@leafygreen-ui/palette";
import SupplierCard from "./SupplierCard";

// `suppliers` lets a caller pass an already-filtered list; without it the full
// set from Redux is rendered.
export default function SupplierGrid({ onFindAlternatives, suppliers }) {
  const affectedSuppliers = useSelector((s) => s.Global.affectedSuppliers) || [];
  const visibleSuppliers = suppliers ?? affectedSuppliers;

  if (!visibleSuppliers.length) {
    return (
      <div style={{ textAlign: "center", padding: 32, color: palette.gray.base }}>
        <Body style={{ color: palette.gray.base }}>
          {affectedSuppliers.length
            ? "No suppliers match the selected condition types."
            : "No affected suppliers identified."}
        </Body>
      </div>
    );
  }

  return (
    <div>
      <div className="d-flex flex-column gap-3">
        {visibleSuppliers.map((supplier) => (
          <SupplierCard
            key={supplier.supplier_id}
            supplier={supplier}
            onFindAlternatives={onFindAlternatives}
          />
        ))}
      </div>
    </div>
  );
}
