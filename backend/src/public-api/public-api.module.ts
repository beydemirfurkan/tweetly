import { Module } from '@nestjs/common';
import { AccountsModule } from '@/accounts/accounts.module';
import { ActionEngineModule } from '@/action-engine/action-engine.module';
import { AdminApiModule } from '@/admin-api/admin-api.module';
import { AuthModule } from '@/auth/auth.module';
import { MonitoringModule } from '@/monitoring/monitoring.module';
import { XAutomationModule } from '@/x-automation/x-automation.module';
import { AccountsController } from './controllers/accounts.controller';
import { ActionsController } from './controllers/actions.controller';
import { LoginController } from './controllers/login.controller';
import { MonitorsController } from './controllers/monitors.controller';
import { XController } from './controllers/x.controller';
import { AccountFacade } from './facades/account.facade';
import { AccountLoginFacade } from './facades/account-login.facade';
import { AccountSummaryService } from './facades/account-summary.service';
import { ActionFacade } from './facades/action.facade';
import { MonitorFacade } from './facades/monitor.facade';
import { XFacade } from './facades/x.facade';

@Module({
  imports: [
    AccountsModule,
    ActionEngineModule,
    AdminApiModule,
    AuthModule,
    MonitoringModule,
    XAutomationModule,
  ],
  controllers: [
    AccountsController,
    ActionsController,
    LoginController,
    MonitorsController,
    XController,
  ],
  providers: [AccountFacade, AccountLoginFacade, AccountSummaryService, ActionFacade, MonitorFacade, XFacade],
})
export class PublicApiModule {}
