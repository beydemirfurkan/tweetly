import { ActionStateMachine, InvalidStateTransitionError } from '../action-state-machine';

describe('ActionStateMachine', () => {
  const sm = new ActionStateMachine();

  it('allows pending → claimed', () => {
    expect(sm.canTransition('pending', 'claimed')).toBe(true);
  });

  it('rejects pending → succeeded directly', () => {
    expect(sm.canTransition('pending', 'succeeded')).toBe(false);
  });

  it('allows running → succeeded', () => {
    expect(sm.canTransition('running', 'succeeded')).toBe(true);
  });

  it('allows failed → pending (retry) and failed → dead', () => {
    expect(sm.canTransition('failed', 'pending')).toBe(true);
    expect(sm.canTransition('failed', 'dead')).toBe(true);
  });

  it('marks succeeded and cancelled as terminal', () => {
    expect(sm.isTerminal('succeeded')).toBe(true);
    expect(sm.isTerminal('cancelled')).toBe(true);
    expect(sm.isTerminal('pending')).toBe(false);
  });

  it('throws InvalidStateTransitionError on assertTransition for invalid', () => {
    expect(() => sm.assertTransition('succeeded', 'pending')).toThrow(InvalidStateTransitionError);
  });
});
