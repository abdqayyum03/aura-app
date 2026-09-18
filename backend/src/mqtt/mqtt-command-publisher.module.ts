import { Module } from '@nestjs/common';
import { MqttCommandPublisherService } from './mqtt-command-publisher.service';

// Deliberately has NO dependency on DevicesModule (unlike MqttModule, the
// ingestion side, which does) - see MqttCommandPublisherService's own
// comment for why that's what avoids a circular module dependency.
@Module({
  providers: [MqttCommandPublisherService],
  exports: [MqttCommandPublisherService],
})
export class MqttCommandPublisherModule {}
