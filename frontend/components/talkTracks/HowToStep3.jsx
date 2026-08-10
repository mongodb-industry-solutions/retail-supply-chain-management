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

const HowToStep3 = () => {
  return (
    <Container>
      <SectionTitle>🔍 Understanding this page</SectionTitle>

      <Body style={bodyStyle}>
        This is <Lead>Step 3 · Search for Alternative Suppliers</Lead> — Phase 2
        of the demo, where the disruption gets resolved. A second ReAct agent
        searches the retailer&apos;s unstructured document library — PDFs,
        emails, contracts, audit reports — to find suppliers that can actually
        replace the critical one you selected in Step 2, and proves each claim
        with the source document.
      </Body>

      <ul style={bulletListStyle}>
        <li>
          <Body style={bodyStyle}>
            <Lead>Affected Supplier</Lead> — the supplier you selected, carried
            over from Step 2.
          </Body>
        </li>
        <li>
          <Body style={bodyStyle}>
            <Lead>Identifying alternative suppliers</Lead> — the agent running a
            four-phase retrieval pipeline.
          </Body>
        </li>
        <li>
          <Body style={bodyStyle}>
            <Lead>Recommended Alternative Suppliers</Lead> — five ranked
            candidates with expandable, document-backed validation rows.
          </Body>
        </li>
      </ul>

      <SectionTitle>👣 How to demo this page</SectionTitle>

      <OrderedList>
        <OrderedListItem
          title="Confirm the supplier you are replacing"
          description={
            <>
              <Body style={bodyStyle}>
                The top section restates the affected supplier so the audience
                knows exactly what the agent is solving for.
              </Body>
              <Screenshot
                src="/images/howTo/selected-affected-supplier.png"
                alt="The affected supplier selected in step 2"
                caption="Affected Supplier — the critical supplier carried into Step 3."
              />
            </>
          }
        />
        <OrderedListItem
          title="Narrate the four phases as the agent runs"
          description={
            <>
              <Body style={bodyStyle}>
                <Lead>1. Plan</Lead> — the agent builds a search profile from the
                risk evaluation: which regions to exclude, which document types
                matter.
                <br />
                <Lead>2. Funnel</Lead> — retrieval: filter by category and
                excluded regions, then Hybrid Search (Vector + Full-Text + RRF)
                across supplier documents, then native Voyage reranking.
                <br />
                <Lead>3. Reflect and Critique</Lead> — for each of the 5
                shortlisted suppliers, audit three criteria:{" "}
                <Mono>compliance_certification</Mono>,{" "}
                <Mono>operational_status</Mono>,{" "}
                <Mono>sustainability_practices</Mono>.
                <br />
                <Lead>4. Close</Lead> — calculate real spherical proximity to the
                distribution centre and persist the shortlist for approval.
              </Body>
              <Screenshot
                src="/images/howTo/alternative-suppliers-agent.png"
                alt="Alternative supplier agent running its four-phase pipeline"
                caption="Identifying alternative suppliers — Plan, Funnel, Reflect and Critique, Close."
              />
              <SayThis>
                &ldquo;This isn&apos;t one search. It plans, retrieves, then
                argues with its own shortlist before it shows you
                anything.&rdquo;
              </SayThis>
            </>
          }
        />
        <OrderedListItem
          title="Open “See full logs →” for the retrieval detail"
          description={
            <>
              <Body style={bodyStyle}>
                In the Funnel phase, look for the line reporting how many
                candidates came from how many document chunks (e.g.{" "}
                <Mono>5 candidates selected from 47 document chunks</Mono>). In
                Reflect and Critique, logs appear per supplier — and when a
                criterion has a gap, the agent runs a targeted follow-up search
                you can see as its own tool call.
              </Body>
              <Screenshot
                src="/images/howTo/drawer-agent-2.png"
                alt="Agent execution logs drawer for the alternative supplier agent"
                caption="Agent logs — per-phase detail including gap-resolution lookups."
              />
            </>
          }
        />
        <OrderedListItem
          title="Read the top alternative supplier card"
          description={
            <>
              <Body style={bodyStyle}>
                Five candidates appear, most to least recommended. Walk the
                header columns: <Lead>Proximity</Lead> (km to the distribution
                centre via <Mono>$geoNear</Mono>), <Lead>Category</Lead>,{" "}
                <Lead>Coverage</Lead> (criteria verified out of three, e.g.{" "}
                <Mono>2/3</Mono>), and <Lead>Summary</Lead> — the precedent
                signal, <Mono>exact_track_record</Mono> if this supplier was
                approved in a similar past disruption.
              </Body>
              <Screenshot
                src="/images/howTo/alternative-suppliers.png"
                alt="List of five recommended alternative suppliers"
                caption="Recommended Alternative Suppliers — ranked shortlist."
              />
            </>
          }
        />
        <OrderedListItem
          title="Expand a validation row and show the evidence"
          description={
            <>
              <Body style={bodyStyle}>
                Expand <Lead>Compliance Certification</Lead>,{" "}
                <Lead>Operational Status</Lead>, or{" "}
                <Lead>Sustainability Practices</Lead>. Each shows the source
                document type badge, filename, page number, and an{" "}
                <Lead>Extracted Content</Lead> block with the exact chunk the
                verdict came from. Click{" "}
                <Lead>📄 View document model</Lead> to show the chunk beside a
                preview of the original file.
              </Body>
              <Screenshot
                src="/images/howTo/alternative-sup-doc.png"
                alt="Document model view showing the chunk used as evidence"
                caption="View document model — the chunk and its source document."
              />
              <SayThis>
                &ldquo;Nothing here is the model&apos;s opinion. Every verdict
                points back at a page in a real document — and the document, the
                chunk, and the embedding all live in the same
                database.&rdquo;
              </SayThis>
            </>
          }
        />
        <OrderedListItem
          title="Address the ❓ Unknown statuses head-on"
          description={
            <Body style={bodyStyle}>
              If no relevant document exists, the criterion shows{" "}
              <Lead>❓ Unknown</Lead> — the agent does not guess. Sustainability
              will often be unknown across candidates. Frame it as a documented
              gap in the supplier file, not a system failure; it is exactly what
              a procurement team would chase next.
            </Body>
          }
        />
        <OrderedListItem
          title="Close the loop with Escalate"
          description={
            <>
              <Body style={bodyStyle}>
                Click <Lead>Escalate</Lead> at the bottom right of a card. A
                full-page <Lead>Congratulations!</Lead> modal confirms the
                decision; <Lead>Got it 👍</Lead> closes it. The approval is
                written back to MongoDB Atlas and enriches the agent&apos;s
                long-term memory.
              </Body>
              <Screenshot
                src="/images/howTo/end.png"
                alt="Congratulations modal shown after escalating an alternative supplier"
                caption="Escalate — the human approval that closes the loop."
              />
              <SayThis>
                &ldquo;A human made the call, and the system just learned from
                it. Next time a disruption like this hits, that decision is
                precedent.&rdquo;
              </SayThis>
            </>
          }
        />
      </OrderedList>

      <SectionTitle>📘 Understanding the results</SectionTitle>

      <ul style={bulletListStyle}>
        <li>
          <Body style={bodyStyle}>
            <Lead>Ranking</Lead> — candidates are ordered most to least
            recommended after reranking, not by raw search score.
          </Body>
        </li>
        <li>
          <Body style={bodyStyle}>
            <Lead>Coverage over confidence</Lead> — <Mono>3/3</Mono> means three
            criteria were verified against documents; a lower number means
            evidence was missing, not that the supplier failed.
          </Body>
        </li>
        <li>
          <Body style={bodyStyle}>
            <Lead>Precedent</Lead> —{" "}
            <Mono>exact_track_record</Mono> beats{" "}
            <Mono>moderate_directional</Mono> and{" "}
            <Mono>weak_directional</Mono>, which come from a cross-supplier
            semantic match in agent memory rather than this supplier&apos;s own
            history.
          </Body>
        </li>
        <li>
          <Body style={bodyStyle}>
            <Lead>Human in the loop</Lead> — the agent shortlists and evidences;
            the manager decides. Approval is the write that makes the system
            smarter.
          </Body>
        </li>
      </ul>

      <Body style={{ ...bodyStyle, marginTop: spacing[200] }}>
        Capabilities on show in this step: multimodal vector search, hybrid
        search (<Mono>$rankFusion</Mono>), native reranking (<Mono>$rerank</Mono>
        ), geospatial proximity (<Mono>$geoNear</Mono>), and agent memory
        write-back — all in MongoDB Atlas.
      </Body>
    </Container>
  );
};

export default HowToStep3;
