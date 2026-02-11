import { IsEnum, IsNotEmpty, IsOptional, IsString, IsMongoId } from 'class-validator';
import { PropertyType, PropertyStatus } from '../schema/property_enum';

export class CreatePropertyDto {
  @IsNotEmpty()
  @IsMongoId()
  owner: string;

  @IsNotEmpty()
  @IsString()
  Propertyaddresse: string;

  @IsOptional()
  @IsString()
  longitude?: string;

  @IsOptional()
  @IsString()
  latitude?: string;

  @IsNotEmpty()
  @IsEnum(PropertyType)
  PropertyType: PropertyType;

  @IsOptional()
  @IsEnum(PropertyStatus)
  propertyStatus?: PropertyStatus;

  @IsOptional()
  @IsString()
  contractId?: string;

  @IsOptional()
  @IsString()
  propertyimage?: string;

  @IsOptional()
  @IsString()
  Registrationdocument?: string;
}

