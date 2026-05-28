import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '@/auth/auth.module';
import { SettingsModule } from '@/settings/settings.module';
import { XDirectModule } from '@/x-automation/x-direct/x-direct.module';
import { ActionEngineModule } from '@/action-engine/action-engine.module';
import { ContentMemoryModule } from '@/content-memory/content-memory.module';
import { CopilotAnalysisEntity } from '@persistence/entities/copilot-analysis.entity';
import { AiCopilotController } from './controllers/ai-copilot.controller';
import { AdminUserGuard } from './guards/admin-user.guard';
import { LLM_CLIENT } from './llm/llm-client.port';
import { OpenRouterLlmClient } from './llm/openrouter-llm.client';
import { ProfileAnalyzerService } from './services/profile-analyzer.service';
import { ContentSuggesterService } from './services/content-suggester.service';
import { ViralScorerService } from './services/viral-scorer.service';
import { CopilotAnalysisService } from './services/copilot-analysis.service';
import { PublishOrchestratorService } from './services/publish-orchestrator.service';

@Module({
  imports: [
    AuthModule,
    SettingsModule,
    XDirectModule,
    ActionEngineModule,
    ContentMemoryModule,
    TypeOrmModule.forFeature([CopilotAnalysisEntity]),
  ],
  controllers: [AiCopilotController],
  providers: [
    AdminUserGuard,
    { provide: LLM_CLIENT, useClass: OpenRouterLlmClient },
    ProfileAnalyzerService,
    ContentSuggesterService,
    ViralScorerService,
    CopilotAnalysisService,
    PublishOrchestratorService,
  ],
  exports: [ProfileAnalyzerService, ContentSuggesterService, PublishOrchestratorService],
})
export class AiCopilotModule {}
