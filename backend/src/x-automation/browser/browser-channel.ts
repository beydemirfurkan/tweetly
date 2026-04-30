export function optionalBrowserChannel(): { channel: string } | Record<string, never> {
  const channel = process.env.PATCHRIGHT_BROWSER_CHANNEL?.trim();
  return channel ? { channel } : {};
}
