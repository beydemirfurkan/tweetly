export function redactMonitor<T extends { webhookSecret?: string | null }>(monitor: T) {
  const { webhookSecret: _omit, ...rest } = monitor as T & { webhookSecret?: string | null };
  return { ...rest, hasWebhookSecret: Boolean(monitor.webhookSecret) };
}
