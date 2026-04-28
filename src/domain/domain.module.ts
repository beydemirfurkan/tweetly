import { Global, Module } from '@nestjs/common';
import { ActionStateMachine } from './services/action-state-machine';
import { RetryPolicy } from './services/retry-policy';
import { IdempotencyKeyService } from './services/idempotency-key';

@Global()
@Module({
  providers: [ActionStateMachine, RetryPolicy, IdempotencyKeyService],
  exports: [ActionStateMachine, RetryPolicy, IdempotencyKeyService],
})
export class DomainModule {}
