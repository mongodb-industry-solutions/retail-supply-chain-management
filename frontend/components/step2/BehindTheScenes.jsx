"use client";

import { Body } from "@leafygreen-ui/typography";
import { OrderedList, OrderedListItem } from "@leafygreen-ui/ordered-list";
import { spacing } from "@leafygreen-ui/tokens";
import BehindTheScenesCard, {
  Mono,
  Lead,
  bodyStyle,
} from "../shared/BehindTheScenesCard";
import WhyMongoDB from "../shared/WhyMongoDB";

export default function BehindTheScenes() {
  return (
    <BehindTheScenesCard
      title="Behind the Scenes: risk_evaluator"
      description="How MongoDB identifies affected suppliers in real time"
      diagramSrc="/images/behindTheScenes/RiskEvaluator.svg"
      diagramAlt="risk_evaluator architecture: disruption signals matched to suppliers via geospatial search, scored, and weighed against historical memory with vector search"
    >
      {/* Intro */}
      <Body style={bodyStyle}>
        Five steps, one job: figure out who&apos;s exposed to a disruption, how
        badly, and whether history should change that judgment — all running on
        a single MongoDB Atlas platform, no separate systems stitched together.
      </Body>

      {/* The five steps */}
      <OrderedList style={{ margin: `${spacing[300]}px 0` }}>
        <OrderedListItem
          description={
            <Body style={bodyStyle}>
              <Lead>Signal detected.</Lead> Reads whatever disruption signals
              are active right now. MongoDB Change Streams let{" "}
              <Mono>risk_evaluator</Mono> react to{" "}
              <Mono>external_conditions</Mono> the instant a new signal is
              written — no polling.
            </Body>
          }
        />
        <OrderedListItem
          description={
            <Body style={bodyStyle}>
              <Lead>Suppliers matched.</Lead> Finds exactly who&apos;s affected:
              a geospatial search (<Mono>$geoWithin</Mono>) for physical events
              like storms or port closures, or a simple region match for events
              with no location, like a tariff. Related order data — what&apos;s
              at stake, and how urgently — comes along in the same step.
            </Body>
          }
        />
        <OrderedListItem
          description={
            <Body style={bodyStyle}>
              <Lead>Risk scored.</Lead> Applies a standard industry risk formula
              (RPN — Risk Priority Number) to turn exposure into one comparable
              score.
            </Body>
          }
        />
        <OrderedListItem
          description={
            <Body style={bodyStyle}>
              <Lead>History weighed.</Lead> The one step where the AI actually
              reasons: has something like this happened before? A MongoDB Vector
              Search (<Mono>$vectorSearch</Mono>) over historical memory
              surfaces relevant past incidents — even from a different supplier
              that faced a similar risk — and lets that real precedent shift the
              score up or down.
            </Body>
          }
        />
        <OrderedListItem
          description={
            <Body style={bodyStyle}>
              <Lead>Decision written.</Lead> The AI writes a plain-language
              summary for the manager, and the final result — score, status, and
              reasoning — is saved as one complete record, ready to hand off to
              the next step in the workflow.
            </Body>
          }
        />
      </OrderedList>

      {/* Why MongoDB */}
      <WhyMongoDB>
        This is exactly the kind of workload MongoDB was built for — an agent
        reasoning in a loop, hitting geospatial and vector search dozens of
        times a session, against real-world data that never stops changing
        shape. One consolidated platform means the agent never round-trips
        between separate systems to assemble context; a flexible,
        document-native model lets a supplier or a signal look different case by
        case — a storm with coordinates, a tariff without any — with no schema
        migration to handle it. And because MongoDB narrows down exactly
        what&apos;s relevant before the AI ever sees it, the agent only spends
        effort — and tokens — on the one decision that actually requires
        judgment. As agents get more capable, controlling token spend comes down
        to controlling context — and that&apos;s the data layer&apos;s job to
        solve, not the prompt&apos;s.
      </WhyMongoDB>
    </BehindTheScenesCard>
  );
}
