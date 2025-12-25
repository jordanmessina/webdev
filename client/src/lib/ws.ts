export function getWsUrl(path: string): string {
  const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${wsProtocol}//${window.location.host}${normalized}`;
}
