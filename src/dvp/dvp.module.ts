import { Module } from '@nestjs/common';
import { DvpService } from './dvp.service';
import { DvpController } from './dvp.controller';

@Module({
  controllers: [DvpController],
  providers: [DvpService],
})
export class DvpModule {}
