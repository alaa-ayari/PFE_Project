import { PartialType, OmitType } from '@nestjs/mapped-types';
import { CreatePropertyDto } from './create-property.dto';

// Exclude owner from update - properties can't be transferred via update
export class UpdatePropertyDto extends PartialType(
  OmitType(CreatePropertyDto, ['owner'] as const)
) {}
