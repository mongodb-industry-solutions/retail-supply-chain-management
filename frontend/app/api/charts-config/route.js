import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    baseUrl: process.env.ATLAS_CHARTS_BASE_URL ?? "",
    dashboardId: process.env.ATLAS_DASHBOARD_ID ?? "",
  });
}
