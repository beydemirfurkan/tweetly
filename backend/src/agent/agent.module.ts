import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '@/auth/auth.module';
import { AccountsModule } from '@/accounts/accounts.module';
import { ActionEngineModule } from '@/action-engine/action-engine.module';
import { ContentMemoryModule } from '@/content-memory/content-memory.module';
import { AiCopilotModule } from '@/ai-copilot/ai-copilot.module';
import { AccountStyleProfileEntity } from '@persistence/entities/account-style-profile.entity';
import { AgentConfigEntity } from '@persistence/entities/agent-config.entity';
import { AgentDraftEntity } from '@persistence/entities/agent-draft.entity';
import { AgentController } from './controllers/agent.controller';
import { StyleProfileService } from './services/style-profile.service';
import { AgentConfigService } from './services/agent-config.service';
import { AgentDraftService } from './services/agent-draft.service';
import { AgentPipelineService } from './services/agent-pipeline.service';
import { AgentSchedulerService } from './services/agent-scheduler.service';

@Module({
  imports: [
    AuthModule,
    AccountsModule,
    ActionEngineModule,
    ContentMemoryModule,
    AiCopilotModule,
    TypeOrmModule.forFeature([
      AccountStyleProfileEntity,
      AgentConfigEntity,
      AgentDraftEntity,
    ]),
  ],
  controllers: [AgentController],
  providers: [
    StyleProfileService,
    AgentConfigService,
    AgentDraftService,
    AgentPipelineService,
    AgentSchedulerService,
  ],
  exports: [AgentConfigService, AgentDraftService, StyleProfileService],
})
export class AgentModule {}
