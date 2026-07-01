"use client";

import { useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Card } from "@leafygreen-ui/card";
import { Body } from "@leafygreen-ui/typography";
import { Badge } from "@leafygreen-ui/badge";
import Button from "@leafygreen-ui/button";
import { palette } from "@leafygreen-ui/palette";
import { spacing } from "@leafygreen-ui/tokens";
import { setSelectedSupplier } from "../../redux/slices/GlobalSlice";
import { riskConfig, categoryConfig } from "../../data/suppliers";
import { conditionConfig, RISK_TYPE_MAP } from "../../data/externalConditions";
import SupplierTitle from "../shared/SupplierTitle";

function ConditionBadgeWithRPN({ risk, triggeredBy }) {
  const cfg =
    conditionConfig[RISK_TYPE_MAP[triggeredBy.risk_type_triggered]] || null;
  return (
    <div className="d-flex align-items-center gap-2">
      {cfg !== null && (
        <Badge variant={cfg.variant}>
          {cfg.icon} {cfg.label}
        </Badge>
      )}
      {risk && (
        <Body style={{ fontSize: 13, margin: 0 }}>
          RPN:{" "}
          <span style={{ color: palette.gray.dark1 }}>
            {risk.rpn_base} base
          </span>
          <span style={{ color: palette.red.base, margin: "0 4px" }}>→</span>
          <span style={{ color: palette.red.base, fontWeight: 700 }}>
            {risk.rpn_dynamic} dynamic
          </span>
        </Body>
      )}
    </div>
  );
}

export default function SupplierCard({ supplier, onFindAlternatives }) {
  const dispatch = useDispatch();
  const selectedId = useSelector((s) => s.Global.selectedSupplier?.supplier_id);
  const isSelected = selectedId === supplier.supplier_id;
  const [summaryExpanded, setSummaryExpanded] = useState(false);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => dispatch(setSelectedSupplier(supplier))}
      onKeyDown={(e) =>
        e.key === "Enter" && dispatch(setSelectedSupplier(supplier))
      }
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
          <SupplierTitle name={supplier?.supplier_name} />
          <div
            className="d-flex gap-2 flex-shrink-0"
            style={{ marginLeft: spacing[400] }}
          >
            <Badge
              variant={
                riskConfig[supplier.operational_context.criticality]?.variant ??
                "lightgray"
              }
            >
              {supplier.operational_context.criticality}
            </Badge>
            {supplier?.product_categories?.map((category) => (
              <Badge
                key={category}
                variant={categoryConfig[category]?.variant ?? "lightgray"}
              >
                {category.replace(/_/g, " ").toUpperCase()}
              </Badge>
            ))}
          </div>
        </div>
            <div className="d-flex flex-row align-items-center gap-3 mb-2">
              <Body
                style={{
                  fontSize: 14,
                  color: palette.gray.dark1,
                }}
              >
                📍 {`${supplier?.country} — ${supplier?.region}`}
              </Body>
              <Body
                style={{
                  fontSize: 14,
                  color: palette.gray.dark1,
                  lineHeight: 1.6,
                }}
              >
                ⚠️ {supplier.supplier_risk_level}.{" "}
                {(supplier.requires_action ?? false)
                  ? "Action required"
                  : "No immediate action required"}
              </Body>
            </div>
        {/* Impact reason (short, bolded) */}
        {supplier.natural_language_summary && (
          <div style={{ marginBottom: spacing[100] }}>
            <Body
              weight="medium"
              style={{
                fontSize: 14,
                color: palette.gray.dark2,
                overflow: "hidden",
                display: "-webkit-box",
                WebkitBoxOrient: "vertical",
                WebkitLineClamp: summaryExpanded ? "unset" : 1,
              }}
            >
              {supplier.natural_language_summary}
            </Body>
            <span
              role="button"
              onClick={(e) => {
                e.stopPropagation();
                setSummaryExpanded((v) => !v);
              }}
              style={{
                fontSize: 13,
                color: palette.blue.base,
                cursor: "pointer",
                userSelect: "none",
              }}
            >
              {summaryExpanded ? "Read less" : "Read more"}
            </span>
          </div>
        )}

        {/* Condition badges with RPN delta */}
        <div
          className="d-flex flex-column gap-1"
          style={{ marginBottom: spacing[200] }}
        >
          {(supplier.risk_scores ?? []).map((risk) => (
            <ConditionBadgeWithRPN
              key={risk.risk_id}
              risk={risk}
              triggeredBy={risk.triggered_by}
            />
          ))}
        </div>

        {/* Footer: contract + lead time + active orders */}
        <div
          className="d-flex flex-wrap gap-3"
          style={{
            fontSize: 13,
            color: palette.gray.dark1,
            marginBottom: spacing[200],
          }}
        >
          {supplier.operational_context.active_orders != null && (
            <span style={{ color: palette.red.dark2, fontWeight: 600 }}>
              📦 {supplier.operational_context.active_orders} active orders
            </span>
          )}
          <span>💰 USD {supplier.operational_context.total_value_usd}</span>
          <span>
            ⏱ Earliest delivery{" "}
            {supplier.operational_context.earliest_delivery_due}{" "}
          </span>
        </div>

        {/* Find alternative suppliers — high severity only */}
        {supplier.operational_context.criticality === "high" &&
          onFindAlternatives && (
            <div
              onClick={(e) => e.stopPropagation()}
              style={{ marginTop: spacing[200] }}
              className="w-100 d-flex flex-row-reverse"
            >
              <Button
                variant="primary"
                size="default"
                onClick={() => onFindAlternatives(supplier)}
              >
                Find alternative suppliers →
              </Button>
            </div>
          )}
      </Card>
    </div>
  );
}
