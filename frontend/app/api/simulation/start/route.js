import { NextResponse } from "next/server";

export async function POST(request) {
  const sessionId = request.headers.get("X-Session-ID");
  if (!sessionId) {
    return NextResponse.json(
      { error: "Missing X-Session-ID header" },
      { status: 400 },
    );
  }

  const backendUrl = process.env.BACKEND_URL;
  if (!backendUrl) {
    return NextResponse.json(
      { error: "BACKEND_URL is not configured" },
      { status: 500 },
    );
  }

  try {
    const res = await fetch(`${backendUrl.replace(/\/$/, "")}/api/simulation/start`, {
      method: "POST",
      headers: { "X-Session-ID": sessionId },
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `Backend error: ${res.status}` },
        { status: res.status },
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { error: "Failed to reach backend" },
      { status: 502 },
    );
  }
}
