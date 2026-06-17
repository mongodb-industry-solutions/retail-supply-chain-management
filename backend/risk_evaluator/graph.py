# LangGraph StateGraph for risk evaluation.
# Nodes (defined in nodes.py):
#   detect_conditions  — identifies triggered external conditions for the session
#   match_suppliers    — finds suppliers affected by those conditions
#   calculate_rpn      — computes Risk Priority Number per supplier-condition pair
#   retrieve_memory    — fetches prior evaluation context from MongoDB checkpointer
#   generate_summary   — calls LLM to produce a human-readable risk summary via SSE
