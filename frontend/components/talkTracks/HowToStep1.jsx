"use client";

import { Body } from "@leafygreen-ui/typography";
import { OrderedList, OrderedListItem } from "@leafygreen-ui/ordered-list";
import { spacing } from "@leafygreen-ui/tokens";
import { Container } from "react-bootstrap";
import {
  Lead,
  Mono,
  SayThis,
  Screenshot,
  SectionTitle,
  bodyStyle,
  bulletListStyle,
} from "./howToUI";

const HowToStep1 = () => {
  return (
    <Container>
      <SectionTitle>🔍 Understanding this page</SectionTitle>

      <Body style={bodyStyle}>
        This is <Lead>Step 1 · External Conditions</Lead>, the starting point of
        the demo. You are playing a <Lead>Supply Chain Manager</Lead> at a large
        grocery superstore retailer, responsible for keeping suppliers — and
        therefore shelves — running.
      </Body>

      <Body style={{ ...bodyStyle, marginTop: spacing[200] }}>
        The page shows how the outside world enters the system. Three real-world
        disruption signals — logistics, geopolitical, and climate — arrive
        simultaneously, are normalized into internal business language, and land
        in MongoDB Atlas. The Dashboard below reads that same data live through
        embedded Atlas Charts.
      </Body>

      <ul style={bulletListStyle}>
        <li>
          <Body style={bodyStyle}>
            <Lead>External Conditions</Lead> — the simulation panel that streams
            in the three disruption signals.
          </Body>
        </li>
        <li>
          <Body style={bodyStyle}>
            <Lead>Dashboard</Lead> — embedded Atlas Charts reading the{" "}
            <Mono>external_conditions</Mono> collection.
          </Body>
        </li>
        <li>
          <Body style={bodyStyle}>
            <Lead>How External Conditions Are Generated</Lead> — an expandable
            card with the ingestion architecture, for technical audiences.
          </Body>
        </li>
      </ul>

      <SectionTitle>👣 How to demo this page</SectionTitle>

      <OrderedList>
        <OrderedListItem
          title="Set the scene before clicking anything"
          description={
            <>
              <Body style={bodyStyle}>
                Point out the navbar and the stepper. Three steps, two phases:
                Phase 1 detects the disruption and its impact (Steps 1–2), Phase
                2 resolves it (Step 3). Future steps are greyed out until
                reached; completed steps stay clickable.
              </Body>
              <SayThis>
                &ldquo;Every supply chain team is reacting to the outside world.
                Let&apos;s watch what happens when three disruptions hit on the
                same morning.&rdquo;
              </SayThis>
            </>
          }
        />
        <OrderedListItem
          title="Click ▶ Start Simulation"
          description={
            <Body style={bodyStyle}>
              The button sits at the top right of the External Conditions
              section. Three condition cards appear at once — 🚢 Logistics, 🛡️
              Geopolitics, and ⛈️ Climate.
            </Body>
          }
        />
        <OrderedListItem
          title="Walk the three condition cards"
          description={
            <>
              <Body style={bodyStyle}>
                Each card shows the condition title, a short description, and
                the affected region. Read one out loud — for example a Red Sea
                corridor disruption — so the audience understands these are
                messy real-world events, not tidy database rows.
              </Body>
              <Screenshot
                src="/images/howTo/external-conditions.png"
                alt="Three external condition cards: logistics, geopolitics, and climate"
                caption="External Conditions after clicking Start Simulation."
              />
              <SayThis>
                &ldquo;These arrived as headlines, vessel positions, and weather
                readings. The ingestion engine already translated them into our
                own risk language and stored them in Atlas.&rdquo;
              </SayThis>
            </>
          }
        />
        <OrderedListItem
          title="Scroll to the Dashboard"
          description={
            <>
              <Body style={bodyStyle}>
                Four Atlas Charts visualizations read the same{" "}
                <Mono>external_conditions</Mono> collection the agents use.
                Click <Lead>Learn More</Lead> to open the Atlas Charts modal
                with customer stories.
              </Body>
              <Screenshot
                src="/images/howTo/atlas-charts.png"
                alt="Dashboard with four embedded Atlas Charts visualizations"
                caption="Dashboard — charts embedded directly in the app."
              />
              <SayThis>
                &ldquo;No BI tool, no export, no second database. The
                operational data and the analytics live on the same
                platform.&rdquo;
              </SayThis>
            </>
          }
        />
        <OrderedListItem
          title="Optional — open the architecture card"
          description={
            <Body style={bodyStyle}>
              For technical audiences, expand{" "}
              <Lead>How External Conditions Are Generated</Lead> to show the
              ingestion diagram and how raw signals get classified, located, and
              scored. Skip it for business audiences.
            </Body>
          }
        />
        <OrderedListItem
          title="Advance with “Go to supplier impact analysis →”"
          description={
            <>
              <Body style={bodyStyle}>
                The button appears at the bottom right once all three conditions
                are visible. Clicking it moves you to Step 2.
              </Body>
              <SayThis>
                &ldquo;In production the risk agent fires the second these
                signals land — no button. We&apos;re clicking it here only so we
                can watch each stage.&rdquo;
              </SayThis>
            </>
          }
        />
      </OrderedList>

      <SectionTitle>📘 Understanding the results</SectionTitle>

      <Body style={bodyStyle}>
        Nothing on this page is scored yet — this step is purely{" "}
        <Lead>signal capture</Lead>. The three conditions are the shared input
        for everything that follows: Step 2 matches them geospatially against
        the supplier base, and Step 3 uses the resulting risk profile to search
        for alternatives.
      </Body>

      <Body style={{ ...bodyStyle, marginTop: spacing[200] }}>
        The ingestion engine generates three trigger signals per session, so
        every demo run starts from the same three-disruption scenario.
      </Body>
    </Container>
  );
};

export default HowToStep1;
