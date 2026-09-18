import { MigrationInterface, QueryRunner } from 'typeorm';

// Adds actuator DESIRED-state columns to devices - what the backend has
// told the device to do (lighting color/intensity, bubbling speed),
// published over MQTT (aura/{deviceCode}/command) whenever changed via
// PATCH /devices/:id/actuators. See ACTUATOR_CONTROL.md for the full
// picture, including why there's no acknowledgement mechanism from the
// device (this is optimistic desired state, not confirmed-applied).
export class DeviceActuatorState1000000000009 implements MigrationInterface {
  name = 'DeviceActuatorState1000000000009';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "light_color_mode_enum" AS ENUM ('white', 'mix');
    `);
    await queryRunner.query(`
      CREATE TYPE "bubbling_speed_enum" AS ENUM ('off', 'slow', 'moderate', 'vigorous');
    `);
    await queryRunner.query(`
      ALTER TABLE "devices"
        ADD COLUMN "light_on" boolean NOT NULL DEFAULT true,
        ADD COLUMN "light_color_mode" "light_color_mode_enum" NOT NULL DEFAULT 'white',
        ADD COLUMN "light_color_hex" varchar,
        ADD COLUMN "light_intensity_percent" smallint NOT NULL DEFAULT 100,
        ADD COLUMN "bubbling_speed" "bubbling_speed_enum" NOT NULL DEFAULT 'moderate';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "devices"
        DROP COLUMN "light_on",
        DROP COLUMN "light_color_mode",
        DROP COLUMN "light_color_hex",
        DROP COLUMN "light_intensity_percent",
        DROP COLUMN "bubbling_speed";
    `);
    await queryRunner.query(`DROP TYPE "light_color_mode_enum";`);
    await queryRunner.query(`DROP TYPE "bubbling_speed_enum";`);
  }
}
