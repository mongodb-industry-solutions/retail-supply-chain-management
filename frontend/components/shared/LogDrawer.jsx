"use client";

import Accordion from "react-bootstrap/Accordion";
import { Drawer } from "@leafygreen-ui/drawer";
import { Overline } from "@leafygreen-ui/typography";
import { palette } from "@leafygreen-ui/palette";
import { spacing } from "@leafygreen-ui/tokens";
import WhyMongoDB from "./WhyMongoDB";
import Icon from "@leafygreen-ui/icon";

export default function LogDrawer({
  show,
  onHide,
  title = "",
  subtitle = "",
  phases: logs = [],
}) {
  console.log("LogDrawer", logs);
  return (
    <>
      <style>{`
        [data-lgid="log-drawer"] > div > div:first-child,
        [data-testid="log-drawer"] > div > div:first-child {
          height: fit-content !important;
          margin: 12px 0px 12px 0px  !important;
        }
        .no-caret .accordion-button::after {
          display: none !important;
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

          <div
            className="d-flex flex-column mt-3"
            style={{
              maxHeight: "calc(100vh - 220px)",
              overflowY: "auto",
              overflowX: "hidden",
            }}
          >
            {logs.map((log, logIdx) => {
              return log.type == 'tool_start'
              ? (
                <div key={logIdx}>
                  <Accordion style={{ borderBottom: "1px solid grey" }}>
                    <Accordion.Header className="no-caret">
                      <div>
                        <Icon glyph="Refresh"></Icon>  {log.message}
                        <br/>
                        <small className="text-secondary">{log.time}</small>
                      </div>

                      </Accordion.Header>
                  </Accordion>
                </div>
              )
              : log.type == 'tool_end'
              ? (
                <div key={logIdx}>
                  <Accordion style={{ borderBottom: "1px solid grey" }}>
                    <Accordion.Header className="no-caret">
                      <div>
                        <Icon color="green" glyph="CheckmarkWithCircle"></Icon>  {log.message}
                                                <br/>
                        <small className="text-secondary">{log.time}</small>
                      </div>
                    </Accordion.Header>
                  </Accordion>
                </div>
              )
              : log.type == 'agent_thought'
              ? (
                <div key={logIdx}>
                  <Accordion style={{ borderBottom: "1px solid grey" }}>
                    <Accordion.Header>
                      <div>
                        <Icon glyph="SMS" color="blue"></Icon>  Agent thought
                        <br/>
                        <small className="text-secondary">{log.time}</small>
                      </div>
                    </Accordion.Header>
                    <Accordion.Body>
                      {log.message}
                    </Accordion.Body>
                  </Accordion>
                </div>
              )
              : log.type == 'atlas_operation'
              ? (
                <div key={logIdx}>
                  <Accordion style={{ borderBottom: "1px solid grey" }}>
                    <Accordion.Header>
                      <div>
                        <Icon glyph="Wrench"></Icon>  Calling tool: {log.feature} on {log.collection}
                        <br/>
                        <small className="text-secondary">{log.time}</small>
                      </div>
                    </Accordion.Header>
                    <Accordion.Body>
                      {log.detail}
                    </Accordion.Body>
                  </Accordion>
                </div>
              )
              : log.type == 'agent_response'  
              ? (
                <div key={logIdx}>
                  <Accordion style={{ borderBottom: "1px solid grey" }}>
                    <Accordion.Header>PROCESS COMPLETE</Accordion.Header>
                    <Accordion.Body>
                      
                    </Accordion.Body>
                  </Accordion>
                </div>
              )
              : 'error'
            
            })}
          </div>
        </div>
      </Drawer>
    </>
  );
}
