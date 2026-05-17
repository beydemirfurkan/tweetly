export function redactMonitor<T extends { webhookSecret?: string | null }>(monitor: T) {
  const { webhookSecret: _omit, ...rest } = monitor as T & { webhookSecret?: string | null };
  void _omit;
  return { ...rest, hasWebhookSecret: Boolean(monitor.webhookSecret) };
}
