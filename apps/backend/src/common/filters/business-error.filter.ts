import { ArgumentsHost, Catch, ExceptionFilter } from "@nestjs/common";
import { Response } from "express";
import { BusinessError } from "src/sale/errors/error";

@Catch(BusinessError)
export class BusinessErrorFilter implements ExceptionFilter {
  catch(exception: BusinessError, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    res.status(409).json({ error: exception.code });
  }
}