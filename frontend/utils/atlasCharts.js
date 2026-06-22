export function createDashboardUrl(baseUrl, dashboardId) {
  const dashboardBase = baseUrl.replace("/embed/charts", "/embed/dashboards");
  const params = new URLSearchParams({
    id: dashboardId,
    theme: "light",
    autoRefresh: "true",
    maxDataAge: "3600",
    showTitleAndDesc: "false",
    scalingWidth: "scale",
    scalingHeight: "scale",
  });
  return `${dashboardBase}?${params.toString()}`;
}
