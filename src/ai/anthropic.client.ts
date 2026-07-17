import { Provider } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Anthropic from "@anthropic-ai/sdk";

// Injection token for the Anthropic client so it can be substituted with a mock
// in unit tests instead of being constructed inline inside AiService.
export const ANTHROPIC_CLIENT = "ANTHROPIC_CLIENT";

export const anthropicClientProvider: Provider = {
  provide: ANTHROPIC_CLIENT,
  inject: [ConfigService],
  useFactory: (config: ConfigService) =>
    new Anthropic({ apiKey: config.get<string>("anthropicApiKey") }),
};
