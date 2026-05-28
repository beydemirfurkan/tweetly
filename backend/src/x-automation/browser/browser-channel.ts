import { envBackedConfig } from '@/config/process-env-shim';

export function optionalBrowserChannel(): { channel: string } | Record<string, never> {
  const channel = envBackedConfig().getOptionalString('PATCHRIGHT_BROWSER_CHANNEL');
  return channel ? { channel } : {};
}
