import { NextResponse } from "next/server";

export async function GET() {
  try {
    return NextResponse.json({
      baseUrl: process.env.ATLAS_CHARTS_BASE_URL ?? "",
      dashboardId: process.env.ATLAS_DASHBOARD_ID ?? "",
    });
  } catch (error) {
    console.error("charts-config API error:", error);
    return NextResponse.json(
      { error: "Failed to load Atlas Charts configuration" },
      { status: 500 }
    );
  }
}
