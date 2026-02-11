import { IsNotEmpty, IsOptional, IsString, IsDateString } from 'class-validator';

export class DeviceInfoDto {
  @IsNotEmpty()
  @IsString()
  deviceId: string;

  @IsOptional()
  @IsString()
  deviceModel?: string;

  @IsOptional()
  @IsString()
  platform?: string;

  @IsOptional()
  @IsString()
  deviceName?: string;

  @IsOptional()
  @IsString()
  ipAddress?: string;
}
