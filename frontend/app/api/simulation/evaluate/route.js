export async function POST(request) {
  const sessionId = request.headers.get("X-Session-ID");
  if (!sessionId) {
    return new Response(JSON.stringify({ error: "Missing X-Session-ID header" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const backendUrl = process.env.BACKEND_URL;
  if (!backendUrl) {
    return new Response(JSON.stringify({ error: "BACKEND_URL is not configured" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const res = await fetch(`${backendUrl.replace(/\/$/, "")}/api/simulation/evaluate`, {
    method: "POST",
    headers: { "X-Session-ID": sessionId },
  });

  if (!res.ok) {
    return new Response(JSON.stringify({ error: `Backend error: ${res.status}` }), {
      status: res.status,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(res.body, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
