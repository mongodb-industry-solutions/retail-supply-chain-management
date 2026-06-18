"use client";

import { Body } from "@leafygreen-ui/typography";
import { palette } from "@leafygreen-ui/palette";
import Image from "next/image";

export default function AgentAvatar({ idle = false }) {
  return (
    <div>
      <Image
        src="/images/icons/agent.png"
        alt="Agent"
        width={250}
        height={166}
      />

      <div style={{ textAlign: "center" }}>
        <Body
          weight="medium"
          style={{ fontSize: 13, color: palette.gray.dark3, margin: 0 }}
        >
          ReAct Agent
        </Body>
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            marginTop: 5,
            background: idle ? palette.gray.light3 : "#e6f4ef",
            borderRadius: 20,
            padding: "3px 10px",
          }}
        >
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: "50%",
              background: idle ? palette.gray.base : "#01684a",
              display: "inline-block",
            }}
          />
          <Body
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: idle ? palette.gray.dark1 : "#01684a",
              margin: 0,
            }}
          >
            {idle ? "Idle" : "Active"}
          </Body>
        </div>
      </div>
    </div>
  );
}
