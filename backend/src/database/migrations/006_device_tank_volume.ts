import { MigrationInterface, QueryRunner } from 'typeorm';

// Needed to convert the biomass CONCENTRATION the RGB->OD->biomass pipeline
// produces (g/L, per the client's Executive Summary formula) into a total
// MASS in grams (g) - which is the unit the existing biomass ring gauge,
// alert threshold, and gauge domain (Dashboard/Internal screens,
// constants/thresholds.ts) already assume. See
// backend/src/mqtt/biomass-calculation.ts for where this gets used.
//
// Default of 10 matches the client doc's most commonly referenced size
// ("10L AURA"), NOT a confirmed per-device value - real units come in
// 1L/10L/100L variants per the spec. There is deliberately no edit
// endpoint/UI for this yet (same scope boundary as lightStartHour/
// lightDurationHours, which also have no edit UI) - it's defaulted, not
// user-configurable, in this pass.
export class DeviceTankVolume1000000000006 implements MigrationInterface {
  name = 'DeviceTankVolume1000000000006';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "devices" ADD COLUMN "tank_volume_liters" double precision NOT NULL DEFAULT 10;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "devices" DROP COLUMN "tank_volume_liters";`);
  }
}
