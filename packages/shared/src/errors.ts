export class VeralError extends Error {
  readonly code: string;

  constructor(code: string, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.code = code;
    this.name = 'VeralError';
  }
}

export class SubjectResolutionError extends VeralError {
  constructor(message: string, options?: { cause?: unknown }) {
    super('SUBJECT_RESOLUTION_ERROR', message, options);
    this.name = 'SubjectResolutionError';
  }
}

export class TierEligibilityError extends VeralError {
  constructor(message: string, options?: { cause?: unknown }) {
    super('TIER_ELIGIBILITY_ERROR', message, options);
    this.name = 'TierEligibilityError';
  }
}

export class PaymentVerificationError extends VeralError {
  constructor(message: string, options?: { cause?: unknown }) {
    super('PAYMENT_VERIFICATION_ERROR', message, options);
    this.name = 'PaymentVerificationError';
  }
}

export class AgentExecutionError extends VeralError {
  constructor(message: string, options?: { cause?: unknown }) {
    super('AGENT_EXECUTION_ERROR', message, options);
    this.name = 'AgentExecutionError';
  }
}
