import { Module } from '@nestjs/common';
import { AuthModule } from '@/auth/auth.module';
import { SettingsModule } from '@/settings/settings.module';
import { XAutomationModule } from '@/x-automation/x-automation.module';
import { ActionEngineModule } from '@/action-engine/action-engine.module';
import { AiCopilotController } from './controllers/ai-copilot.controller';
import { AdminUserGuard } from './guards/admin-user.guard';
import { OpenRouterService } from './services/openrouter.service';
import { ProfileAnalyzerService } from './services/profile-analyzer.service';
import { ContentSuggesterService } from './services/content-suggester.service';
import { ViralScorerService } from './services/viral-scorer.service';

@Module({
  imports: [AuthModule, SettingsModule, XAutomationModule, ActionEngineModule],
  controllers: [AiCopilotController],
  providers: [
    AdminUserGuard,
    OpenRouterService,
    ProfileAnalyzerService,
    ContentSuggesterService,
    ViralScorerService,
  ],
})
export class AiCopilotModule {}
