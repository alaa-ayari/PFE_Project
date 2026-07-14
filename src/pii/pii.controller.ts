// PII anonymizer REST endpoint.

import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../config/guard/jwt-auth.guard';
import { PiiService } from './pii.service';

@Controller('pii')
@UseGuards(JwtAuthGuard)
export class PiiController {
  constructor(private readonly pii: PiiService) {}

  @Post('anonymize')
  anonymize(@Body() body: { text: string; language?: string }) {
    return this.pii.anonymize(body?.text ?? '', body?.language ?? 'en');
  }
}
