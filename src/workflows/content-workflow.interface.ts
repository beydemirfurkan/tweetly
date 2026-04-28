export interface IContentWorkflow {
  readonly scenarioType: string;
  run(accountId?: string): Promise<void>;
}
