import { MigrationInterface, QueryRunner } from 'typeorm';

// Adds 'co2_absorbed' and 'o2_released' - server-computed, not device-
// published (they never go through TelemetryPayloadSchema/extractValidReadings'
// validation path). Written by MqttIngestionService alongside a computed
// 'biomass' reading whenever a fresh RGB triple arrives - see
// backend/src/mqtt/biomass-calculation.ts. Same "narrow sensor_readings
// schema, generic pipeline" payoff as migration 005: these ride the exact
// same history/current-value/realtime machinery as every other metric with
// zero additional plumbing, once the enum has the values.
export class AddImpactMetrics1000000000007 implements MigrationInterface {
  name = 'AddImpactMetrics1000000000007';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Same transaction caveat as migration 005 - if this errors on your
    // Postgres/pooler combo, run it manually via psql and mark the
    // migration as applied.
    await queryRunner.query(
      `ALTER TYPE "metric_type_enum" ADD VALUE IF NOT EXISTS 'co2_absorbed';`,
    );
    await queryRunner.query(`ALTER TYPE "metric_type_enum" ADD VALUE IF NOT EXISTS 'o2_released';`);
  }

  public async down(): Promise<void> {
    // No ALTER TYPE ... DROP VALUE in Postgres - same reasoning as
    // migration 005's down(). A real rollback needs a deliberate
    // type-rebuild migration, not an automatic one here.
  }
}
