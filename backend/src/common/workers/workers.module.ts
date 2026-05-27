import { Global, Module } from '@nestjs/common';
import { WorkerOptionsFactory } from './worker-options.factory';

@Global()
@Module({
  providers: [WorkerOptionsFactory],
  exports: [WorkerOptionsFactory],
})
export class WorkersModule {}
