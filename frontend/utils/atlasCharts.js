export function createDashboardUrl(baseUrl, dashboardId) {
  const params = new URLSearchParams({
    id: dashboardId,
    theme: "light",
    autoRefresh: "true",
    maxDataAge: "3600",
    showTitleAndDesc: "false",
    scalingWidth: "scale",
    scalingHeight: "scale",
  });
  return `${baseUrl}/embed/dashboards?${params.toString()}`;
}
