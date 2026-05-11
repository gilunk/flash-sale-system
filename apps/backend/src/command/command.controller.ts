import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { CommandAuthGuard } from 'src/common/guards/command-auth.guard';
import { CommandService } from './command.service';

@Controller('command')
@UseGuards(CommandAuthGuard)
export class CommandController {
  constructor(
    private commandService: CommandService,
  ) {}

  @Post('insert-sale')
  async ping(@Body() body) {
    if (isNaN(+body.qty)) {
      return 'qty must be a number';
    }

    return await this.commandService.insertFlashSale(+body.qty);
  }
}
