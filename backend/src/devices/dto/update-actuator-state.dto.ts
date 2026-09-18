import { IsBoolean, IsEnum, IsIn, IsOptional, IsString, Matches } from 'class-validator';
import { BubblingSpeed, LightColorMode } from '../../database/entities/device.entity';

// All fields optional - a partial update (e.g. just flipping lightOn)
// shouldn't require resending every other field. DevicesService.
// updateActuatorState merges whatever's present onto the device's current
// state before publishing the FULL resulting state over MQTT - see that
// method's comment for why the full state, not just the delta, is what
// gets published.
export class UpdateActuatorStateDto {
  @IsOptional()
  @IsBoolean()
  lightOn?: boolean;

  @IsOptional()
  @IsEnum(LightColorMode)
  lightColorMode?: LightColorMode;

  @IsOptional()
  @IsString()
  @Matches(/^#[0-9a-fA-F]{6}$/, {
    message: 'lightColorHex must be a 6-digit hex color, e.g. #FFAA00',
  })
  lightColorHex?: string;

  // Matches the client spec's 4 strength presets exactly (100%/75%/50%/25%)
  // - not an arbitrary 0-100 range.
  @IsOptional()
  @IsIn([25, 50, 75, 100])
  lightIntensityPercent?: number;

  @IsOptional()
  @IsEnum(BubblingSpeed)
  bubblingSpeed?: BubblingSpeed;
}
