import { IsMongoId, IsOptional, IsString, IsNumber, IsObject } from 'class-validator';

export class CreateContractDto {
  @IsMongoId()
  applicationId: string;

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsObject()
  fields?: Record<string, string>;

  @IsOptional()
  @IsNumber()
  dealAmount?: number;

  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  endDate?: string;
}
