"use client";

import dynamic from "next/dynamic";
import { useSelector } from "react-redux";
import { Card } from "@leafygreen-ui/card";
import { palette } from "@leafygreen-ui/palette";
import SectionHeader from "../shared/SectionHeader";
import { conditionConfig, RISK_TYPE_MAP } from "../../data/externalConditions";
import Icon from "@leafygreen-ui/icon";
import { Overline } from "@leafygreen-ui/typography";

const LeafletMap = dynamic(() => import("./LeafletMap"), { ssr: false });

export default function WorldMap() {
  const externalConditions = useSelector((s) => s.Global.externalConditions);
  const affectedSuppliers = useSelector((s) => s.Global.affectedSuppliers) || [];
  const selectedSupplier = useSelector((s) => s.Global.selectedSupplier);
  
  return (
    <Card>
      <SectionHeader
        title="Impact zones"
        subtitle={`${externalConditions.length} active external conditions · ${affectedSuppliers.length} affected suppliers`}
      />
      <LeafletMap
        conditions={externalConditions}
        suppliers={affectedSuppliers}
        selectedSupplier={selectedSupplier}
      />
      <div className="mt-2">
        <div className="d-flex align-items-center gap-2">
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: "50%",
              background: palette.gray.base,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon
              glyph="Building"
              size="large"
              style={{ color: palette.white }}
            />
          </div>
          <Overline
            style={{
              color: palette.gray.dark1,
              display: "block",
            }}
          >
            Affected supplier location
          </Overline>
        </div>
        {
          externalConditions.map((c) => (
            <div
              key={c.condition_id}
              className="d-flex align-items-center gap-2 mt-1"
            >
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: "50%",
                  border: `2px solid ${conditionConfig[RISK_TYPE_MAP[c.risk_type_triggered]]?.borderColor ?? "#6b7280"}`
                }}
              />
              <Overline
                style={{
                  color: palette.gray.dark1,
                  display: "block",
                }}
              >
                {RISK_TYPE_MAP[c.risk_type_triggered]} impact zone
              </Overline>
            </div>
          ))
        }
      </div>
    </Card>
  );
}
