"use client";

import dynamic from "next/dynamic";
import { Card } from "@leafygreen-ui/card";
import { palette } from "@leafygreen-ui/palette";
import SectionHeader from "../shared/SectionHeader";
import { simulatedAffectedSuppliers } from "../../data/suppliers";
import { simulatedExternalConditions, conditionConfig } from "../../data/externalConditions";
import Icon from "@leafygreen-ui/icon";
import { Overline } from "@leafygreen-ui/typography";

const LeafletMap = dynamic(() => import("./LeafletMap"), { ssr: false });

export default function WorldMap() {
  return (
    <Card>
      <SectionHeader
        title="Impact zones"
        subtitle={`${simulatedExternalConditions.length} active external conditions · ${simulatedAffectedSuppliers.length} affected suppliers`}
      />
      <LeafletMap
        conditions={simulatedExternalConditions}
        suppliers={simulatedAffectedSuppliers}
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
          simulatedExternalConditions.map((c) => (
            <div
              key={c.type}
              className="d-flex align-items-center gap-2 mt-1"
            >
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: "50%",
                  border: `2px solid ${conditionConfig[c.type]?.borderColor ?? "#6b7280"}`
                }}
              />
              <Overline
                style={{
                  color: palette.gray.dark1,
                  display: "block",
                }}
              >
                {c.type} impact zone
              </Overline>
            </div>
          ))
        }
      </div>
    </Card>
  );
}
