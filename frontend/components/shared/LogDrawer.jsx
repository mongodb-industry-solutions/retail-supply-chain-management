"use client";

import Accordion from "react-bootstrap/Accordion";
import { Drawer } from "@leafygreen-ui/drawer";
import { Overline } from "@leafygreen-ui/typography";
import { palette } from "@leafygreen-ui/palette";
import { spacing } from "@leafygreen-ui/tokens";
import WhyMongoDB from "./WhyMongoDB";

export default function LogDrawer({
  show,
  onHide,
  title = "",
  subtitle = "",
  phases = [],
}) {
  return (
    <>
      <style>{`
        [data-lgid="log-drawer"] > div > div:first-child,
        [data-testid="log-drawer"] > div > div:first-child {
          height: fit-content !important;
          margin: 12px 0px 12px 0px  !important;
        }
      `}</style>
      <Drawer
        open={show}
        onClose={onHide}
        data-lgid="log-drawer"
        title={
          <div
            className="d-flex flex-column"
            style={{ height: "fit-content", margin: "10px 0" }}
          >
            <p className="m-0">{title}</p>
            <small style={{ fontSize: 13 }} className="text-secondary m-0">
              {subtitle}
            </small>
          </div>
        }
        displayMode="overlay"
        size="default"
        style={{
          borderLeft: `2px solid ${palette.gray.dark2}`,
          boxShadow: `-4px 0 12px rgba(0,0,0,0.4)`,
        }}
      >
        <div>
          <WhyMongoDB title="🍃 LangGraph + MongoDB">
            LangChain and MongoDB{" "}
            <a
              href="https://www.mongodb.com/docs/atlas/ai-integrations/langgraph/build-agents/"
              target="_blank"
              rel="noopener noreferrer"
            >
              combined stack
            </a>{" "}
            gives agents retrieval, persistent memory, access to operational
            data, observability, and reliable deployment across the full
            pipeline — all without rearchitecting the data layer.
          </WhyMongoDB>

          <div className="d-flex flex-column gap-4 mt-3">
            {phases.map((phase, phaseIdx) => (
              <div key={phaseIdx}>
                <Overline
                  style={{
                    display: "block",
                    marginBottom: spacing[200],
                    color: palette.gray.dark1,
                    paddingBottom: spacing[100],
                    borderBottom: `1px solid ${palette.gray.light2}`,
                  }}
                >
                  {phase.name}
                </Overline>

                <Accordion>
                  {phase.steps.map((step, stepIdx) => (
                    <Accordion.Item key={stepIdx} eventKey={String(stepIdx)}>
                      <Accordion.Header>{step.name}</Accordion.Header>
                      <Accordion.Body>
                        <div className="d-flex flex-column gap-1">
                          {step.logs.map((line, lineIdx) => (
                            <p
                              key={lineIdx}
                              style={{
                                fontSize: 12,
                                fontFamily: "monospace",
                                color: palette.gray.dark3,
                                margin: 0,
                                lineHeight: 1.7,
                              }}
                            >
                              {line}
                            </p>
                          ))}
                        </div>
                      </Accordion.Body>
                    </Accordion.Item>
                  ))}
                </Accordion>
              </div>
            ))}
          </div>
        </div>
      </Drawer>
    </>
  );
}
