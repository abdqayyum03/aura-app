import { MigrationInterface, QueryRunner } from 'typeorm';

// NOTE: TimescaleDB functions (create_hypertable, add_continuous_aggregate_policy, etc.)
// run outside a transaction in some versions. If this migration fails partway on your
// Postgres/Timescale version, run the failed statements manually via psql and re-mark
// the migration as applied.
export class SensorReadingsHypertable1000000000002 implements MigrationInterface {
  name = 'SensorReadingsHypertable1000000000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS timescaledb;`);

    await queryRunner.query(`
      CREATE TABLE "sensor_readings" (
        "id" uuid DEFAULT uuid_generate_v4(),
        "device_id" uuid NOT NULL REFERENCES "devices"("id") ON DELETE CASCADE,
        "metric_type" metric_type_enum NOT NULL,
        "value" double precision NOT NULL,
        "unit" varchar,
        "recorded_at" timestamptz NOT NULL,
        PRIMARY KEY ("id", "recorded_at")
      );
    `);

    // Partition on recorded_at - this is what makes 1h/1d/1w range queries and
    // retention policies cheap at high ingestion volume.
    await queryRunner.query(`
      SELECT create_hypertable('sensor_readings', 'recorded_at', chunk_time_interval => INTERVAL '1 day');
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_readings_device_metric_time"
      ON "sensor_readings" ("device_id", "metric_type", "recorded_at" DESC);
    `);

    // --- Continuous aggregates backing the app's 1h / 1d / 1w granularity toggle ---
    // Each bucket stores avg/min/max so the API can show a smooth line and,
    // later, min/max bands without re-scanning raw rows.

    await queryRunner.query(`
      CREATE MATERIALIZED VIEW "sensor_readings_1h"
      WITH (timescaledb.continuous) AS
      SELECT
        device_id,
        metric_type,
        time_bucket('1 hour', recorded_at) AS bucket,
        avg(value) AS avg_value,
        min(value) AS min_value,
        max(value) AS max_value,
        count(*) AS sample_count
      FROM sensor_readings
      GROUP BY device_id, metric_type, bucket
      WITH NO DATA;
    `);

    await queryRunner.query(`
      CREATE MATERIALIZED VIEW "sensor_readings_1d"
      WITH (timescaledb.continuous) AS
      SELECT
        device_id,
        metric_type,
        time_bucket('1 day', recorded_at) AS bucket,
        avg(value) AS avg_value,
        min(value) AS min_value,
        max(value) AS max_value,
        count(*) AS sample_count
      FROM sensor_readings
      GROUP BY device_id, metric_type, bucket
      WITH NO DATA;
    `);

    await queryRunner.query(`
      CREATE MATERIALIZED VIEW "sensor_readings_1w"
      WITH (timescaledb.continuous) AS
      SELECT
        device_id,
        metric_type,
        time_bucket('1 week', recorded_at) AS bucket,
        avg(value) AS avg_value,
        min(value) AS min_value,
        max(value) AS max_value,
        count(*) AS sample_count
      FROM sensor_readings
      GROUP BY device_id, metric_type, bucket
      WITH NO DATA;
    `);

    // Refresh policies: keep recent buckets up to date automatically.
    await queryRunner.query(`
      SELECT add_continuous_aggregate_policy('sensor_readings_1h',
        start_offset => INTERVAL '3 hours',
        end_offset => INTERVAL '1 minute',
        schedule_interval => INTERVAL '5 minutes');
    `);
    await queryRunner.query(`
      SELECT add_continuous_aggregate_policy('sensor_readings_1d',
        start_offset => INTERVAL '3 days',
        end_offset => INTERVAL '1 hour',
        schedule_interval => INTERVAL '1 hour');
    `);
    await queryRunner.query(`
      SELECT add_continuous_aggregate_policy('sensor_readings_1w',
        start_offset => INTERVAL '3 weeks',
        end_offset => INTERVAL '1 day',
        schedule_interval => INTERVAL '6 hours');
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP MATERIALIZED VIEW IF EXISTS "sensor_readings_1w" CASCADE;`);
    await queryRunner.query(`DROP MATERIALIZED VIEW IF EXISTS "sensor_readings_1d" CASCADE;`);
    await queryRunner.query(`DROP MATERIALIZED VIEW IF EXISTS "sensor_readings_1h" CASCADE;`);
    await queryRunner.query(`DROP TABLE IF EXISTS "sensor_readings";`);
  }
}
