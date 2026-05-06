import { IsEnum, IsMongoId, IsNumber, IsOptional, IsPositive, IsString } from 'class-validator';

export class CreateApplicationDto {
  @IsMongoId()
  propertyId: string;

  @IsEnum(['rent', 'buy'])
  type: string;

  @IsOptional()
  @IsString()
  message?: string;
}

export class UpdateApplicationStatusDto {
  @IsEnum([
    'pending',
    'under_review',
    'visit_scheduled',
    'pre_approved',
    'accepted',
    'rejected',
    'cancelled',
  ])
  status: string;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsString()
  rejectionReason?: string;

  @IsOptional()
  @IsString()
  visitDate?: string;
}

export class CreateMessageDto {
  @IsString()
  content: string;
}

export class SetAmountDto {
  @IsNumber()
  @IsPositive()
  dealAmount: number;
}
