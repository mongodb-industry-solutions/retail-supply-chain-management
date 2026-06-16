"use client";

import { useDispatch, useSelector } from "react-redux";
import { Card } from "@leafygreen-ui/card";
import { Body } from "@leafygreen-ui/typography";
import { Badge } from "@leafygreen-ui/badge";
import Button from "@leafygreen-ui/button";
import { palette } from "@leafygreen-ui/palette";
import { spacing } from "@leafygreen-ui/tokens";
import { setSelectedSupplier } from "../../redux/slices/GlobalSlice";
import { riskConfig, categoryConfig } from "../../data/suppliers";
import { conditionConfig } from "../../data/externalConditions";

function ConditionBadgeWithRPN({ type, rpnByCondition }) {
  const cfg = conditionConfig[type];
  const rpn = rpnByCondition?.[type];
  if (!cfg) return null;
  return (
    <div className="d-flex align-items-center gap-2">
      <Badge variant={cfg.variant}>
        {cfg.icon} {cfg.label}
      </Badge>
      {rpn && (
        <Body style={{ fontSize: 13, margin: 0 }}>
          RPN:{" "}
          <span style={{ color: palette.gray.dark1 }}>{rpn.base}</span>
          <span style={{ color: palette.red.base, margin: "0 4px" }}>→</span>
          <span style={{ color: palette.red.base, fontWeight: 700 }}>{rpn.updated}</span>
        </Body>
      )}
    </div>
  );
}

export default function SupplierCard({ supplier, onFindAlternatives }) {
  const dispatch = useDispatch();
  const selectedId = useSelector((s) => s.Global.selectedSupplier?.id);
  const isSelected = selectedId === supplier.id;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => dispatch(setSelectedSupplier(supplier))}
      onKeyDown={(e) => e.key === "Enter" && dispatch(setSelectedSupplier(supplier))}
      style={{ cursor: "pointer" }}
    >
    <Card
      style={{
        borderLeft: `4px solid ${isSelected ? palette.green.dark2 : palette.gray.light2}`,
        background: isSelected ? palette.green.light3 : "#fff",
        transition: "border-color 0.15s ease, background 0.15s ease",
      }}
    >
      {/* Header: name + location / risk + category badges */}
      <div
        className="d-flex align-items-start justify-content-between"
        style={{ marginBottom: spacing[200] }}
      >
        <div>
          <Body
            weight="medium"
            style={{ fontSize: 16, color: palette.gray.dark3, marginBottom: spacing[100] }}
          >
            {supplier.name}
          </Body>
          <Body style={{ fontSize: 14, color: palette.gray.dark1 }}>
            📍 {supplier.location ?? `${supplier.country} — ${supplier.region}`}
          </Body>
        </div>
        <div className="d-flex gap-2 flex-shrink-0" style={{ marginLeft: spacing[400] }}>
          <Badge variant={riskConfig[supplier.riskLevel]?.variant ?? "lightgray"}>
            {riskConfig[supplier.riskLevel]?.label ?? supplier.riskLevel}
          </Badge>
          <Badge variant={categoryConfig[supplier.category]?.variant ?? "lightgray"}>
            {supplier.category}
          </Badge>
        </div>
      </div>

      {/* Impact reason (short, bolded) */}
      {supplier.impactReason && (
        <Body
          weight="medium"
          style={{ fontSize: 14, color: palette.gray.dark2, marginBottom: spacing[100] }}
        >
          ⚠️ {supplier.impactReason}
        </Body>
      )}

      {/* Impact description */}
      <Body
        style={{
          fontSize: 14,
          color: palette.gray.dark1,
          lineHeight: 1.6,
          marginBottom: spacing[200],
        }}
      >
        {supplier.impactDescription}
      </Body>

      {/* Condition badges with RPN delta */}
      <div className="d-flex flex-column gap-1" style={{ marginBottom: spacing[200] }}>
        {(supplier.affectedConditions ?? []).map((type) => (
          <ConditionBadgeWithRPN key={type} type={type} rpnByCondition={supplier.rpnByCondition} />
        ))}
      </div>

      {/* Footer: contract + lead time + active orders */}
      <div
        className="d-flex flex-wrap gap-3"
        style={{ fontSize: 13, color: palette.gray.dark1, marginBottom: spacing[200] }}
      >
        <span>💰 {supplier.contractValue}</span>
        <span>⏱ {supplier.leadTime}</span>
        {supplier.activeOrders ? (
          <span style={{ color: palette.red.dark2, fontWeight: 600 }}>
            📦 {supplier.activeOrders.count} active orders ({supplier.activeOrders.value})
          </span>
        ) : (
          <span>📦 {supplier.annualShipments} shipments/yr</span>
        )}
      </div>

      {/* Find alternative suppliers — critical severity only */}
      {supplier.severity === "critical" && onFindAlternatives && (
        <div onClick={(e) => e.stopPropagation()} style={{ marginTop: spacing[200] }}>
          <Button variant="primary" size="default" onClick={() => onFindAlternatives(supplier)}>
            Find alternative suppliers →
          </Button>
        </div>
      )}
    </Card>
    </div>
  );
}
