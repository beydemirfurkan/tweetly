import { Controller, Get } from '@nestjs/common';
import { appBaseUrl, backendBaseUrl, MCP_RESOURCE_PATH } from './oauth-urls';

// Public discovery endpoints per MCP 2025-06-18 + RFC 9728 (Protected
// Resource Metadata) + RFC 8414 (Authorization Server Metadata). No auth.
@Controller('.well-known')
export class WellKnownController {
  @Get('oauth-protected-resource')
  protectedResource() {
    const backend = backendBaseUrl();
    return {
      resource: `${backend}${MCP_RESOURCE_PATH}`,
      authorization_servers: [backend],
      bearer_methods_supported: ['header'],
      resource_documentation: `${appBaseUrl()}/docs`,
    };
  }

  @Get('oauth-authorization-server')
  authorizationServer() {
    const backend = backendBaseUrl();
    const app = appBaseUrl();
    return {
      issuer: backend,
      authorization_endpoint: `${app}/oauth/authorize`,
      token_endpoint: `${backend}/oauth/token`,
      registration_endpoint: `${backend}/oauth/register`,
      revocation_endpoint: `${backend}/oauth/revoke`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code'],
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['client_secret_basic', 'client_secret_post'],
      scopes_supported: ['*'],
    };
  }
}
