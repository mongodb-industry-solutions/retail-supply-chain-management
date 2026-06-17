# The risk_evaluator has no external HTTP endpoint.
# It is activated internally by watch_external_conditions() in stream_listener.py,
# which opens a MongoDB Change Stream on the external_conditions collection and
# triggers graph execution whenever a matching demo trigger document is inserted.
