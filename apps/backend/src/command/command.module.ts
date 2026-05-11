import { Module } from '@nestjs/common';
import { CommandController } from './command.controller';
import { PrismaService } from 'src/db/prisma.service';
import { CommandService } from './command.service';

@Module({
  imports: [],
  providers: [PrismaService, CommandService],
  controllers: [
    CommandController,
  ],
})
export class CommandModule {}
