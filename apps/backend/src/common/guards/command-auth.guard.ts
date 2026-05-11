import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';

@Injectable()
export class CommandAuthGuard implements CanActivate {
  private logger = new Logger(CommandAuthGuard.name);

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();

    this.logger.log(`command headers ${JSON.stringify(req.headers)}`);

    const secret = req.headers['x-command-secret'];

    if (process.env.COMMAND_SECRET !== secret) {
      throw new ForbiddenException('Incorrect secret');
    }

    return true;
  }
}
