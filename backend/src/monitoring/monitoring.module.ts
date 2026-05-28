import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MonitorEntity } from '@persistence/entities/monitor.entity';
import { WebhookDeliveryEntity } from '@persistence/entities/webhook-delivery.entity';
import { XDirectModule } from '@/x-automation/x-direct/x-direct.module';
import { MonitoringService } from './monitoring.service';
import { MonitorPollerService } from './monitor-poller.service';
import { WebhookDeliveryService } from './webhook-delivery.service';
import { WebhookDeliveryHistoryService } from './webhook-delivery-history.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([MonitorEntity, WebhookDeliveryEntity]),
    XDirectModule,
  ],
  providers: [MonitoringService, WebhookDeliveryHistoryService, MonitorPollerService, WebhookDeliveryService],
  exports: [MonitoringService, WebhookDeliveryHistoryService],
})
export class MonitoringModule {}
