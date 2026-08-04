"use client";

import Image from "next/image";
import { ExpandableCard } from "@leafygreen-ui/expandable-card";
import { Body } from "@leafygreen-ui/typography";
import { OrderedList, OrderedListItem } from "@leafygreen-ui/ordered-list";
import { palette } from "@leafygreen-ui/palette";
import { spacing } from "@leafygreen-ui/tokens";
import WhyMongoDB from "../shared/WhyMongoDB";

const sources = [
  {
    name: "NOAA",
    detail:
      "(National Oceanic and Atmospheric Administration) — U.S. government weather and climate data: droughts, storms, temperature anomalies.",
  },
  {
    name: "GDELT",
    detail:
      "(Global Database of Events, Language and Tone) — a global monitor of news coverage across 65 languages, used here to detect geopolitical events, trade disputes, and regulatory shifts as they're reported.",
  },
  {
    name: "MarineTraffic",
    detail:
      "— real-time vessel tracking and port activity data (via AIS signals), used to detect shipping delays, port congestion, and logistics disruptions.",
  },
];

const bulletListStyle = {
  margin: `${spacing[200]}px 0`,
  paddingLeft: spacing[600],
};

function Mono({ children }) {
  return (
    <code
      style={{
        fontFamily: "var(--font-geist-mono, monospace)",
        fontSize: "0.9em",
        color: palette.green.dark2,
      }}
    >
      {children}
    </code>
  );
}

function Lead({ children }) {
  return (
    <strong style={{ color: palette.gray.dark3, fontWeight: 700 }}>
      {children}
    </strong>
  );
}

const bodyStyle = { color: palette.gray.dark2, fontSize: 15 };

export default function HowExternalConditionsGenerated() {
  return (
    <ExpandableCard
      title="How External Conditions Are Generated"
      description="Multi-agent architecture for real-time risk detection"
      defaultOpen={false}
      style={{ marginBottom: spacing[400] }}
    >
      <div style={{ padding: `${spacing[200]}px 0` }}>
        {/* Architecture diagram */}
        <Image
          src="/images/behindTheScenes/IngestionEngine.svg"
          alt="Ingestion Engine architecture: external data sources normalized in MongoDB Atlas and streamed to the risk evaluator"
          width={960}
          height={540}
          style={{
            width: "100%",
            height: "auto",
            borderRadius: 10,
            border: `1px solid ${palette.gray.light2}`,
            marginBottom: spacing[400],
          }}
        />

        {/* Intro + data sources */}
        <Body style={bodyStyle}>
          This is where the system turns the outside world into something it can
          reason about. The signals come from real-world data sources, each
          covering a different risk category:
        </Body>
        <ul style={bulletListStyle}>
          {sources.map((s) => (
            <li key={s.name} style={{ marginBottom: spacing[100] }}>
              <Body style={bodyStyle}>
                <Lead>{s.name}</Lead> {s.detail}
              </Body>
            </li>
          ))}
        </ul>

        {/* The four steps */}
        <OrderedList style={{ marginBottom: spacing[300] }}>
          <OrderedListItem
            description={
              <Body style={bodyStyle}>
                <Lead>Raw signal in.</Lead> A scheduled poller connects to each
                source&apos;s API, pulling in whatever format each one returns.
                These sources don&apos;t arrive as clean data — they arrive as
                headlines, coordinates, port status reports.
              </Body>
            }
          />
          <OrderedListItem
            description={
              <>
                <Body style={bodyStyle}>
                  <Lead>Normalization, powered by MongoDB.</Lead> The Ingestion
                  Engine takes that raw signal and runs it through the same
                  discipline a risk management team already uses: classify it
                  against known risk categories, locate exactly who it affects,
                  and score how strongly it&apos;s active right now — turning a
                  real-world event into a number the rest of the system can act
                  on. MongoDB Atlas makes each step possible without bolting
                  together separate tools:
                </Body>
                <ul style={bulletListStyle}>
                  <li style={{ marginBottom: spacing[100] }}>
                    <Body style={bodyStyle}>
                      <Lead>Geo Search</Lead> — locates signals geographically
                      and matches their impact radius against supplier
                      locations, answering &quot;who is physically in the path
                      of this event.&quot;
                    </Body>
                  </li>
                  <li style={{ marginBottom: spacing[100] }}>
                    <Body style={bodyStyle}>
                      <Lead>Full-Text Search</Lead> — classifies the raw signal
                      against the risk catalog by matching exact terms,
                      regulatory acronyms, and category keywords (e.g.
                      &quot;OFAC,&quot; &quot;CBAM,&quot; &quot;port
                      congestion&quot;) straight from the headline.
                    </Body>
                  </li>
                  <li>
                    <Body style={bodyStyle}>
                      <Lead>Flexibility</Lead> — not every signal looks the
                      same. A port congestion event carries coordinates and an
                      impact radius; a tariff or sanctions signal has no
                      physical location at all. MongoDB&apos;s document model
                      adapts to each one without forcing a rigid,
                      one-size-fits-all schema. This is what lets the Ingestion
                      Engine read the static risk profile from{" "}
                      <Mono>risk_catalog</Mono> and write the newly scored
                      signal to <Mono>external_conditions</Mono> in whatever
                      shape it needs — every signal, however messy or varied,
                      gets translated into the same ready-to-use language the
                      rest of the system speaks.
                    </Body>
                  </li>
                </ul>
              </>
            }
          />
          <OrderedListItem
            description={
              <Body style={bodyStyle}>
                <Lead>Ready to visualize.</Lead> Once normalized, the signal is
                immediately queryable — <Lead>MongoDB Charts</Lead> reads
                directly off the same live collection, no separate ETL step or
                data pipeline needed to turn a fresh signal into a dashboard
                update.
              </Body>
            }
          />
          <OrderedListItem
            description={
              <Body style={bodyStyle}>
                <Lead>Triggering the next agent.</Lead> The write itself is the
                trigger: a <Lead>Change Stream</Lead> on{" "}
                <Mono>external_conditions</Mono> notifies{" "}
                <Mono>risk_evaluator</Mono> the instant a new signal lands — no
                polling, no scheduler, no message queue in between. By the time
                a human would have refreshed a dashboard, the next agent has
                already started reasoning over the signal.
              </Body>
            }
          />
        </OrderedList>

        {/* Why MongoDB */}
        <div style={{ marginBottom: spacing[300] }}>
          <WhyMongoDB>
            One platform covers geolocation, search, real-time reactivity, and
            flexible schema together — the alternative would be stitching
            together separate specialized tools just to get a single signal
            ready to use, let alone reacted to and visualized.
          </WhyMongoDB>
        </div>

        {/* Demo note */}
        <Body
          style={{
            color: palette.gray.dark1,
            fontSize: 15,
            fontStyle: "italic",
          }}
        >
          In this demo, the Ingestion Engine simulates that same integration
          behavior by design. It doesn&apos;t call these external APIs live — it
          generates deterministic, pre-calibrated signals using the exact same
          MongoDB capabilities shown above, so every demo session produces a
          consistent, reliable risk scenario to build the story around.
        </Body>
      </div>
    </ExpandableCard>
  );
}
