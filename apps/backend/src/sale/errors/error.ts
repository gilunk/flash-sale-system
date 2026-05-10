export type ErrorCode =
  | 'SALE_NOT_STARTED'
  | 'SALE_ENDED'
  | 'SOLD_OUT'
  | 'ALREADY_PURCHASED';

export class BusinessError extends Error {
  constructor(public readonly code: ErrorCode) { super(code); }
}