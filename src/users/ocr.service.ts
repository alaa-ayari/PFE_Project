import { Injectable, BadRequestException } from '@nestjs/common';
import sharp from 'sharp';
import axios from 'axios';
import FormData from 'form-data';

type VerificationSide = 'front' | 'back';

interface OcrProfileHint {
  firstName?: string;
  lastName?: string;
}

interface OcrScanResult {
  side: VerificationSide;
  rawText: string;
  extractedFields: Record<string, string>;
  fieldConfidences: Record<string, number>;
  missingFields: string[];
  confidenceHints: string[];
  requiresManualReview: boolean;
  providerResponse: Record<string, unknown>;
  normalizedImageBuffer: Buffer;
}

const LOW_FIELD_CONFIDENCE = 0.55;

const PYTHON_OCR_URL =
  process.env.PYTHON_OCR_URL ?? 'http://localhost:8001/ocr/scan';

@Injectable()
export class OcrService {
  async extractStructuredIdCardData(
    imageBuffer: Buffer,
    side: VerificationSide,
    profileHint?: OcrProfileHint,
  ): Promise<OcrScanResult> {
    const normalizedImageBuffer = await this.normalizeBaseImage(imageBuffer);

    const form = new FormData();
    form.append('image', normalizedImageBuffer, {
      filename: 'card.png',
      contentType: 'image/png',
    });
    form.append('side', side);

    let data: {
      rawText: string;
      extractedFields: Record<string, string>;
      fieldConfidences?: Record<string, number>;
      confidence: number;
      missingFields: string[];
      requiresManualReview: boolean;
    };

    try {
      const response = await axios.post<{
        rawText: string;
        extractedFields: Record<string, string>;
        fieldConfidences?: Record<string, number>;
        confidence: number;
        missingFields: string[];
        requiresManualReview: boolean;
      }>(PYTHON_OCR_URL, form, {
        headers: form.getHeaders(),
        timeout: 90_000,
        validateStatus: (s) => s === 200,
      });
      data = response.data;
    } catch (err) {
      throw new BadRequestException(
        `OCR service unavailable — make sure the Python CIN OCR service is running on ${PYTHON_OCR_URL}. Error: ${(err as Error).message}`,
      );
    }

    const fieldConfidences = data.fieldConfidences ?? {};

    const confidenceHints = this.buildConfidenceHints(
      side,
      data.extractedFields,
      data.missingFields,
      data.confidence,
      data.rawText,
      profileHint,
      fieldConfidences,
    );

    return {
      side,
      rawText: data.rawText,
      extractedFields: data.extractedFields,
      fieldConfidences,
      missingFields: data.missingFields,
      confidenceHints,
      requiresManualReview: data.requiresManualReview || confidenceHints.length > 0,
      providerResponse: { source: 'python-easyocr', confidence: data.confidence },
      normalizedImageBuffer,
    };
  }

  async extractIdentityNumber(imageBuffer: Buffer): Promise<string> {
    const result = await this.extractStructuredIdCardData(imageBuffer, 'front');
    const { identityNumber } = result.extractedFields;
    if (!identityNumber) {
      throw new BadRequestException(
        'Could not extract identity number from the image.',
      );
    }
    return identityNumber;
  }

  async extractAllText(imageBuffer: Buffer): Promise<string> {
    const result = await this.extractStructuredIdCardData(imageBuffer, 'front');
    return result.rawText;
  }

  private async normalizeBaseImage(imageBuffer: Buffer): Promise<Buffer> {
    try {
      const image = sharp(imageBuffer, { failOn: 'none' }).rotate();
      const metadata = await image.metadata();

      if (!metadata.width || !metadata.height) {
        throw new BadRequestException('Unable to read the uploaded image dimensions');
      }
      if (metadata.width < 700 || metadata.height < 400) {
        throw new BadRequestException('ID card image resolution is too low');
      }

      return image
        .resize({ width: 1800, withoutEnlargement: true })
        .removeAlpha()
        .png()
        .toBuffer();
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException(
        `Image preprocessing failed: ${(error as Error).message}`,
      );
    }
  }

  private buildConfidenceHints(
    side: VerificationSide,
    extractedFields: Record<string, string>,
    missingFields: string[],
    confidence: number,
    rawText: string,
    profileHint?: OcrProfileHint,
    fieldConfidences: Record<string, number> = {},
  ): string[] {
    const hints: string[] = [];

    if (confidence < 65) hints.push('OCR confidence is low; manual review recommended');
    if (rawText.length < 30) hints.push('OCR output is very short and may be incomplete');
    if (missingFields.length > 0) {
      hints.push(`Missing required ${side} fields: ${missingFields.join(', ')}`);
    }

    // Per-field low-confidence warnings — surfaced to the user so they pay
    // close attention to those fields in the review screen.
    const lowConfFields = Object.entries(fieldConfidences)
      .filter(([, c]) => c < LOW_FIELD_CONFIDENCE)
      .map(([f]) => f);
    if (lowConfFields.length > 0) {
      hints.push(
        `Low OCR confidence on ${side} field(s): ${lowConfFields.join(', ')} — please double-check before confirming`,
      );
    }

    if (side === 'front') {
      const { identityNumber, firstName, lastName, dateOfBirth } = extractedFields;

      if (identityNumber && !/^\d{8}$/.test(identityNumber)) {
        hints.push('Extracted identity number is not exactly 8 digits');
      }
      if (
        dateOfBirth &&
        !/^(\d{2})\/(\d{2})\/(\d{4})$/.test(dateOfBirth)
      ) {
        hints.push('Extracted date of birth is not in DD/MM/YYYY format');
      }
      if (profileHint?.firstName && firstName &&
          this.normalizeForCompare(profileHint.firstName) !== this.normalizeForCompare(firstName)) {
        hints.push('Extracted first name differs from the current profile');
      }
      if (profileHint?.lastName && lastName &&
          this.normalizeForCompare(profileHint.lastName) !== this.normalizeForCompare(lastName)) {
        hints.push('Extracted last name differs from the current profile');
      }
    }

    return hints;
  }

  private normalizeForCompare(value?: string): string {
    return value?.toLowerCase().replace(/\s+/g, ' ').trim() ?? '';
  }
}
