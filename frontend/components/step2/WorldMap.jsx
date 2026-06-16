"use client";

import { Body } from "@leafygreen-ui/typography";
import { Badge } from "@leafygreen-ui/badge";
import { palette } from "@leafygreen-ui/palette";
import SectionHeader from "../shared/SectionHeader";
import { simulatedAffectedSuppliers } from "../../data/suppliers";
import {Card} from "@leafygreen-ui/card";

export default function WorldMap() {
  return (
    <Card>
      <div>
        <SectionHeader
          title="Impact zones"
          subtitle={`${simulatedAffectedSuppliers.length} active external conditions`}
        />

        <Body style={{ color: palette.gray.base, fontSize: 13 }}>
          Google map comming soon!
        </Body>
      </div>
    </Card>
  );
}
