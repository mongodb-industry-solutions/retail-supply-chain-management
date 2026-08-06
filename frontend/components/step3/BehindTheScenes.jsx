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
      title="Behind the Scenes: alternative_finder"
      description="How MongoDB is perfect for multimodal search"
      diagramSrc="/images/behindTheScenes/AlternativeFinder.png"
      diagramAlt="alternative_finder architecture: hybrid search narrows supplier candidates, evidence is audited with reflect and critique, and distance is ranked with geospatial search"
    >
      {/* Intro */}
      <Body style={bodyStyle}>
        Once <Mono>risk_evaluator</Mono> flags a supplier as CRITICAL, a name
        alone isn&apos;t enough — a procurement manager needs a replacement they
        can actually trust, backed by real evidence: is this candidate
        certified, do they have capacity, has anything gone wrong with them
        before.
      </Body>

      {/* The five steps */}
      <OrderedList style={{ margin: `${spacing[300]}px 0` }}>
        <OrderedListItem
          description={
            <Body style={bodyStyle}>
              <Lead>Plan built.</Lead> MongoDB gathers the real facts first —
              the flagged risk, resolved against the risk catalog, plus the
              disrupted supplier&apos;s open orders and how urgent they are.
              Only then does the AI step in, turning those facts into a concrete
              search brief: which regions to rule out, and what kind of evidence
              matters most for this specific risk. That brief is what narrows
              the field in the next step — so by the time the audit (Reflect
              &amp; Critique) starts checking candidates, it&apos;s only ever
              reviewing suppliers that already fit the plan, not the whole
              universe.
            </Body>
          }
        />
        <OrderedListItem
          description={
            <Body style={bodyStyle}>
              <Lead>Field narrowed.</Lead> Out of the whole supplier universe,
              hybrid search (<Mono>$rankFusion</Mono>, combining vector search
              and full-text search) finds the candidates that actually fit —
              then native reranking reorders them by true relevance, right
              inside the database. Every piece of evidence behind this — a
              certificate excerpt, a contract clause — is stored as its own
              chunk, right alongside the search vector used to find it and the
              expiry date that decides if it&apos;s even still valid. No
              separate document store, no separate vector database.
            </Body>
          }
        />
        <OrderedListItem
          description={
            <Body style={bodyStyle}>
              <Lead>Evidence audited.</Lead> This is the Reflect &amp; Critique
              step: the AI drafts a case for each candidate, citing real stored
              chunks — then a second, separate AI pass, with no memory of
              writing that first draft, checks it like a skeptical reviewer who
              wasn&apos;t in the room. That separation matters: an AI grading
              its own homework tends to agree with itself. A fresh pass,
              checking independently, is what makes the audit real instead of a
              rubber stamp. Every claim needs a citation that actually holds up
              — if the evidence doesn&apos;t back it, the answer honestly stays
              &quot;unknown&quot; instead of guessing. This level of scrutiny is
              reserved for exactly this moment, because it&apos;s the one point
              where an unverified claim would reach a manager&apos;s actual
              decision. A MongoDB Vector Search (<Mono>$vectorSearch</Mono>)
              over historical memory checks for precedent too — has anything
              like this gone wrong before, with this candidate or a comparable
              one.
            </Body>
          }
        />
        <OrderedListItem
          description={
            <Body style={bodyStyle}>
              <Lead>Distance ranked.</Lead> A geospatial search (
              <Mono>$geoNear</Mono>) measures how far each surviving candidate
              actually is from where the product needs to go, and folds that
              real distance into the final ranking.
            </Body>
          }
        />
        <OrderedListItem
          description={
            <Body style={bodyStyle}>
              <Lead>Case written &amp; decision recorded.</Lead> The AI writes a
              plain-language explanation for why each candidate landed where it
              did, then the final ranked shortlist — evidence, distance, and
              reasoning together — is saved as one complete record and held for
              a human to actually approve. Nothing moves forward on its own.
            </Body>
          }
        />
      </OrderedList>

      {/* Why MongoDB */}
      <WhyMongoDB>
        Underneath the step names, this is what a real &quot;context layer&quot;
        looks like — not a database that just stores evidence for an AI to read,
        but the thing deciding what evidence is even worth the AI&apos;s
        attention before it drafts a single claim. The rule is simple: a handful
        of candidates can go straight to the AI, but a whole document library
        needs narrowing down first — dumping hundreds of documents into a prompt
        is expensive and mostly useless anyway. That narrowing happens entirely
        inside the database, with zero AI involved, before any claim gets
        drafted. And because none of that lives in separate systems, security
        isn&apos;t an afterthought: the same permissions and encryption
        protecting a contract also protect the search built on top of it —
        there&apos;s no second copy of anything sitting somewhere else with its
        own rules. That&apos;s also what lets this grow without breaking: more
        suppliers, more documents, more risk types is just more data in the same
        place — not a new system to bolt on and keep in sync.
      </WhyMongoDB>
    </BehindTheScenesCard>
  );
}
