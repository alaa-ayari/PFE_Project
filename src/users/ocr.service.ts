import { Injectable, BadRequestException } from '@nestjs/common';
import { createWorker } from 'tesseract.js';

@Injectable()
export class OcrService {
  /**
   * Extract identity number from Tunisian ID card image
   * @param imageBuffer - The image buffer of the ID card
   * @returns The extracted identity number
   */
  async extractIdentityNumber(imageBuffer: Buffer): Promise<string> {
    try {
      // Initialize Tesseract worker (logger disabled for clean output)
      const worker = await createWorker('ara+eng', 1);

      // Process the image
      const { data: { text } } = await worker.recognize(imageBuffer);
      
      await worker.terminate();
      const identityNumberPattern = /\b\d{8}\b/g;
      const matches = text.match(identityNumberPattern);

      if (!matches || matches.length === 0) {
        throw new BadRequestException('Could not extract identity number from the image. Please ensure the image is clear and contains a valid Tunisian ID card.');
      }


      return matches[0];
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(`OCR processing failed: ${error.message}`);
    }
  }

  /**
   * Extract all text from ID card for debugging purposes
   * @param imageBuffer - The image buffer of the ID card
   * @returns All extracted text
   */
  async extractAllText(imageBuffer: Buffer): Promise<string> {
    try {
      const worker = await createWorker('ara+eng', 1);
      const { data: { text } } = await worker.recognize(imageBuffer);
      await worker.terminate();
      return text;
    } catch (error) {
      throw new BadRequestException(`OCR processing failed: ${error.message}`);
    }
  }
}
