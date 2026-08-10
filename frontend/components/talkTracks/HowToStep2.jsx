"use client";

import { Body } from "@leafygreen-ui/typography";
import { OrderedList, OrderedListItem } from "@leafygreen-ui/ordered-list";
import { spacing } from "@leafygreen-ui/tokens";
import { Container } from "react-bootstrap";
import {
  ImagePlaceholder,
  Lead,
  Mono,
  SayThis,
  Screenshot,
  SectionTitle,
  bodyStyle,
  bulletListStyle,
} from "./howToUI";

const HowToStep2 = () => {
  return (
    <Container>
      <SectionTitle>🔍 Understanding this page</SectionTitle>

      <Body style={bodyStyle}>
        This is <Lead>Step 2 · Identify Affected Suppliers</Lead>. The three
        external conditions from Step 1 are now cross-referenced against the
        retailer&apos;s supplier base by a <Lead>ReAct agent</Lead> — reason,
        act, repeat — to answer one question: which of my suppliers are actually
        at risk, and how badly?
      </Body>

      <ul style={bulletListStyle}>
        <li>
          <Body style={bodyStyle}>
            <Lead>Supplier Impact Analysis</Lead> — a compact recap of the three
            active conditions, each with a <Mono>{"{}"}</Mono> button to view its
            document model.
          </Body>
        </li>
        <li>
          <Body style={bodyStyle}>
            <Lead>Identifying affected suppliers</Lead> — the agent, its live
            status, and its reasoning log.
          </Body>
        </li>
        <li>
          <Body style={bodyStyle}>
            <Lead>Affected Suppliers</Lead> — the results: a ranked supplier list
            on the left, the Impact Zone Map on the right.
          </Body>
        </li>
      </ul>

      <SectionTitle>👣 How to demo this page</SectionTitle>

      <OrderedList>
        <OrderedListItem
          title="Recap the conditions, then open a document model"
          description={
            <>
              <Body style={bodyStyle}>
                At the top, click the <Mono>{"{}"}</Mono> button on any condition
                row. This shows the real document stored in the{" "}
                <Mono>external_conditions</Mono> collection — a good moment for
                the flexible document model point.
              </Body>
              <Screenshot
                src="/images/howTo/supplier-impact-analysis.png"
                alt="Compact list of the three active external conditions with document model buttons"
                caption="Supplier Impact Analysis — the three conditions carried over from Step 1."
              />
            </>
          }
        />
        <OrderedListItem
          title="Let the agent run and narrate its status"
          description={
            <>
              <Body style={bodyStyle}>
                The agent badge pulses 🟢 <Lead>Active</Lead> while processing
                and settles to ⚫ <Lead>Idle</Lead> when results are ready. Log
                steps appear one by one, each with a spinner that becomes a green
                tick.
              </Body>
              <Screenshot
                src="/images/howTo/agent-1.png"
                alt="ReAct agent running with its reasoning steps appearing one by one"
                caption="Identifying affected suppliers — the ReAct loop in progress."
              />
              <SayThis>
                &ldquo;It isn&apos;t running one query. It reasons, calls a tool,
                reads the result, and decides what to look at next — exactly how
                an analyst would work through this.&rdquo;
              </SayThis>
            </>
          }
        />
        <OrderedListItem
          title="Open “See full logs →” once the agent is Idle"
          description={
            <>
              <Body style={bodyStyle}>
                The drawer slides in from the right with the full reasoning
                trace. Point out that both the agent&apos;s short-term state and
                its long-term memory live in MongoDB — LangGraph checkpoints and
                store, not a bolted-on service.
              </Body>
              <Screenshot
                src="/images/howTo/drawer-agent-1.png"
                alt="Agent execution logs drawer showing the reasoning steps"
                caption="Agent Execution Logs drawer."
              />
            </>
          }
        />
        <OrderedListItem
          title="Read one affected supplier card end to end"
          description={
            <>
              <Body style={bodyStyle}>
                Suppliers are sorted most to least critical. On one card, walk
                through: the severity tag (CRITICAL or HIGH), <Lead>Reason</Lead>{" "}
                for the impact, and <Lead>Affected by</Lead> — the colour-coded
                condition badges. Then land on the dynamic RPN, e.g.{" "}
                <Mono>RPN: 45 → 168</Mono>.
              </Body>
              <Screenshot
                src="/images/howTo/affected-suppliers.png"
                alt="Affected supplier list on the left and the impact zone map on the right"
                caption="Affected Suppliers — ranked list plus Impact Zone Map."
              />
              <SayThis>
                &ldquo;That baseline risk score of 45 was fine yesterday.
                In the context of today&apos;s disruption the agent
                re-scored it to 168 — this is risk that moves with the
                world.&rdquo;
              </SayThis>
            </>
          }
        />
        <OrderedListItem
          title="Connect the list to the map"
          description={
            <Body style={bodyStyle}>
              Each condition draws a colour-coded dashed geofence zone that
              pulses on the map. Supplier pins are red for CRITICAL and amber for
              HIGH. Click a supplier card to highlight its pin — the pin
              enlarges and shows a tooltip; hovering a pin highlights its card in
              return.
            </Body>
          }
        />
        <OrderedListItem
          title="Show the geospatial pipeline (technical audiences)"
          description={
            <>
              <Body style={bodyStyle}>
                Above the two-column layout, click{" "}
                <Lead>View geospatial aggregation pipeline</Lead> to expand the
                actual <Mono>$geoWithin</Mono> / <Mono>$centerSphere</Mono> query
                used to find suppliers inside each impact radius, and read the 🍃{" "}
                <Lead>Why MongoDB?</Lead> callout beside it.
              </Body>
            </>
          }
        />
        <OrderedListItem
          title="Advance from a CRITICAL card"
          description={
            <>
              <Body style={bodyStyle}>
                Only CRITICAL suppliers show{" "}
                <Lead>Find alternative suppliers →</Lead> at the bottom right of
                the card. Clicking it carries that supplier into Step 3.
              </Body>
              <SayThis>
                &ldquo;We know who&apos;s at risk. Now the real work — finding
                someone who can actually replace them.&rdquo;
              </SayThis>
            </>
          }
        />
      </OrderedList>

      <SectionTitle>📘 Understanding the results</SectionTitle>

      <ul style={bulletListStyle}>
        <li>
          <Body style={bodyStyle}>
            <Lead>Ordering</Lead> — the list is always affected suppliers only,
            sorted most to least critical.
          </Body>
        </li>
        <li>
          <Body style={bodyStyle}>
            <Lead>Multiple badges</Lead> — a supplier hit by two conditions shows
            one badge and one RPN per condition, not a single blended score.
          </Body>
        </li>
        <li>
          <Body style={bodyStyle}>
            <Lead>Severity drives the workflow</Lead> — CRITICAL unlocks
            alternative sourcing; HIGH is monitored, not replaced.
          </Body>
        </li>
      </ul>

      <Body style={{ ...bodyStyle, marginTop: spacing[200] }}>
        Under the hood this single step uses geospatial matching, Vector Search,
        and agent memory — all in MongoDB Atlas, no external GIS or vector
        service.
      </Body>
    </Container>
  );
};

export default HowToStep2;
