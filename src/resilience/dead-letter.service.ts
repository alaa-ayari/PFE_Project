// Persists failed external writes for later replay.

import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { DeadLetter } from './dead-letter.schema';

@Injectable()
export class DeadLetterService {
  private readonly logger = new Logger(DeadLetterService.name);

  constructor(
    @InjectModel(DeadLetter.name)
    private readonly model: Model<DeadLetter>,
  ) {}

  async record(
    channel: string,
    payload: Record<string, any>,
    error: unknown,
    attempts: number,
  ): Promise<void> {
    const msg = error instanceof Error ? error.message : String(error);
    this.logger.error(
      `[DEAD-LETTER] channel=${channel} attempts=${attempts} error=${msg}`,
    );
    try {
      await this.model.create({
        channel,
        payload,
        error: msg,
        attempts,
        replayed: false,
      });
    } catch (e) {
      this.logger.error(
        `[DEAD-LETTER] failed to persist ${channel} record: ${e}`,
      );
    }
  }
}
