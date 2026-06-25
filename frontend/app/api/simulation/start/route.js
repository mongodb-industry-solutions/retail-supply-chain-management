import { NextResponse } from "next/server";

export async function POST(request) {
  const sessionId = request.headers.get("X-Session-ID");

  const res = await fetch(`${process.env.BACKEND_URL}/api/simulation/start`, {
    method: "POST",
    headers: { "X-Session-ID": sessionId },
  });

  if (!res.ok) {
    return NextResponse.json({ error: `Backend error: ${res.status}` }, { status: res.status });
  }

  const data = await res.json();
  return NextResponse.json(data);
}
