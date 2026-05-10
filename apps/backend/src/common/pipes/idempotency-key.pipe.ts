import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import { Request } from "express";

export const IdempotencyKey = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext) => {
    const req = ctx.switchToHttp().getRequest<Request>();
    return req.header('Idempotency-Key');
  },
);
