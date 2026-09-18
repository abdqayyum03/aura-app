import { MigrationInterface, QueryRunner } from 'typeorm';

// Adds the new "biomass" metric type requested by the client (Aug 2026).
// NOTE: no physical sensor for this exists in the confirmed hardware spec
// (Executive Summary 3.0 only lists RGB color + CO2/temp/humidity air
// sensors) - this is software plumbing ahead of hardware confirmation,
// same pattern as the rest of the ASSUMED payload contract. See
// src/mqtt/PAYLOAD_CONTRACT.md, open question #6.
export class AddBiomassMetric1000000000005 implements MigrationInterface {
  name = 'AddBiomassMetric1000000000005';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Postgres allows ALTER TYPE ... ADD VALUE inside a transaction (12+),
    // but the new value can't be used in the SAME transaction it was added
    // in - fine here since this migration only adds it, doesn't insert rows.
    // If your TypeORM migration runner errors on this statement anyway
    // (some older Postgres/pooler combos still complain), run it manually
    // via psql and mark this migration as applied - same caveat as
    // migration 002's Timescale functions.
    await queryRunner.query(`ALTER TYPE "metric_type_enum" ADD VALUE IF NOT EXISTS 'biomass';`);
  }

  public async down(): Promise<void> {
    // Postgres has no ALTER TYPE ... DROP VALUE. Removing an enum value
    // safely requires rebuilding the type (create new type, migrate
    // columns, drop old type) - not worth the downtime risk for a rollback
    // path that will likely never be exercised. If this ever needs to be
    // reverted for real, do it as a deliberate follow-up migration, not
    // silently here.
  }
}
