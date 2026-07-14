import { IsEnum, IsMongoId, IsNumber, IsOptional, IsPositive, IsString, Matches, MaxLength } from 'class-validator';

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
  @MaxLength(2000)
  @Matches(/^\[(Q:[A-Za-z0-9_-]+|A:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+)\].*$/s, {
    message:
      'content must follow the structured format [Q:questionId]text or [A:answeredQid:answerTemplateId]text',
  })
  content: string;
}

export class SetAmountDto {
  @IsNumber()
  @IsPositive()
  dealAmount: number;
}

export class ProposeVisitDto {
  @IsString()
  scheduledAt: string;

  @IsOptional()
  @IsString()
  location?: string;
}

export class ProposePriceDto {
  @IsNumber()
  @IsPositive()
  amount: number;

  @IsOptional()
  @IsString()
  terms?: string;
}

export class RespondProposalDto {
  @IsEnum(['accept', 'reject'])
  decision: 'accept' | 'reject';
}

export class SetConditionsDto {
  @IsOptional()
  @IsString()
  conditions?: string;
}
