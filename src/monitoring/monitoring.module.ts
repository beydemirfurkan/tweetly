import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MonitorEntity } from '../persistence/entities/monitor.entity';
import { WebhookDeliveryEntity } from '../persistence/entities/webhook-delivery.entity';
import { XAutomationModule } from '../x-automation/x-automation.module';
import { MonitoringService } from './monitoring.service';
import { MonitorPollerService } from './monitor-poller.service';
import { WebhookDeliveryService } from './webhook-delivery.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([MonitorEntity, WebhookDeliveryEntity]),
    XAutomationModule,
  ],
  providers: [MonitoringService, MonitorPollerService, WebhookDeliveryService],
  exports: [MonitoringService],
})
export class MonitoringModule {}
