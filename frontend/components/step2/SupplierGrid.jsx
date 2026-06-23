"use client";

import { useSelector } from "react-redux";
import { Body } from "@leafygreen-ui/typography";
import { palette } from "@leafygreen-ui/palette";
import SupplierCard from "./SupplierCard";
import { generateAffectedSuppliers } from "../../data/suppliers";

export default function SupplierGrid({ onFindAlternatives }) {
  const loadedConditions = useSelector((s) => s.Global.loadedExternalConditions);
  const suppliers = generateAffectedSuppliers(loadedConditions);

  if (!suppliers.length) {
    return (
      <div style={{ textAlign: "center", padding: 32, color: palette.gray.base }}>
        <Body style={{ color: palette.gray.base }}>No affected suppliers identified.</Body>
      </div>
    );
  }

  return (
    <div>

      <div className="d-flex flex-column gap-3">
        {suppliers.map((supplier) => (
          <SupplierCard
            key={supplier.id}
            supplier={supplier}
            onFindAlternatives={onFindAlternatives}
          />
        ))}
      </div>
    </div>
  );
}
