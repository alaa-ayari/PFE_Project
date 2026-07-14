// Microsoft Presidio anonymizer client with optional strict fail-closed mode.

import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import axios from 'axios';

export interface AnonymizeResult {
  anonymized: string;
  hasPii: boolean;
  entities: Array<{ type: string; start: number; end: number; score: number }>;
  degraded?: boolean;
}

@Injectable()
export class PiiService {
  private readonly logger = new Logger(PiiService.name);
  private readonly baseUrl =
    process.env.PII_SERVICE_URL || 'http://localhost:8002';
  private readonly strict =
    (process.env.PII_STRICT ?? '').toLowerCase() === 'true';

  private readonly internalToken = process.env.INTERNAL_API_TOKEN ?? '';

  async anonymize(text: string, language = 'en'): Promise<AnonymizeResult> {
    if (!text || !text.trim()) {
      return { anonymized: text, hasPii: false, entities: [] };
    }
    try {
      const res = await axios.post(
        `${this.baseUrl}/anonymize`,
        { text, language },
        {
          timeout: 8000,
          headers: this.internalToken
            ? { 'X-Internal-Token': this.internalToken }
            : undefined,
        },
      );
      const data = res.data as {
        anonymized?: string;
        hasPii?: boolean;
        entities?: AnonymizeResult['entities'];
      };
      return {
        anonymized: data.anonymized ?? text,
        hasPii: !!data.hasPii,
        entities: data.entities ?? [],
      };
    } catch (e: any) {
      if (this.strict) {
        this.logger.error(
          `PII service unavailable and PII_STRICT=true — blocking request: ` +
            (e?.message ?? e),
        );
        throw new ServiceUnavailableException(
          'Privacy service unavailable — request blocked to avoid leaking personal data.',
        );
      }
      this.logger.warn(
        `PII service unavailable — forwarding text UNMASKED: ` +
          (e?.message ?? e),
      );
      return { anonymized: text, hasPii: false, entities: [], degraded: true };
    }
  }
}
