"use client";

import { useSelector } from "react-redux";
import { Body } from "@leafygreen-ui/typography";
import { palette } from "@leafygreen-ui/palette";
import SupplierCard from "./SupplierCard";

export default function SupplierGrid({ onFindAlternatives }) {
  const affectedSuppliers = useSelector((s) => s.Global.affectedSuppliers) || [];

  if (!affectedSuppliers.length) {
    return (
      <div style={{ textAlign: "center", padding: 32, color: palette.gray.base }}>
        <Body style={{ color: palette.gray.base }}>No affected suppliers identified.</Body>
      </div>
    );
  }

  return (
    <div>
      <div className="d-flex flex-column gap-3">
        {affectedSuppliers.map((supplier) => (
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
