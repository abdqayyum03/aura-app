import { MigrationInterface, QueryRunner } from 'typeorm';

export class CoreSchema1000000000001 implements MigrationInterface {
  name = 'CoreSchema1000000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`);

    await queryRunner.query(`
      CREATE TABLE "users" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "email" varchar NOT NULL UNIQUE,
        "password_hash" varchar NOT NULL,
        "name" varchar,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      );
    `);

    await queryRunner.query(`
      CREATE TYPE "device_status_enum" AS ENUM ('active', 'offline', 'maintenance');
    `);

    await queryRunner.query(`
      CREATE TABLE "devices" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "device_code" varchar NOT NULL UNIQUE,
        "label" varchar,
        "owner_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
        "status" device_status_enum NOT NULL DEFAULT 'offline',
        "light_start_hour" smallint NOT NULL DEFAULT 6,
        "light_duration_hours" smallint NOT NULL DEFAULT 12,
        "last_seen_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      );
    `);
    await queryRunner.query(`CREATE INDEX "idx_devices_device_code" ON "devices" ("device_code");`);

    await queryRunner.query(`
      CREATE TYPE "maintenance_type_enum" AS ENUM (
        'water_change', 'filter_replacement', 'harvest', 'nutrient_refill', 'calibration', 'other'
      );
    `);
    await queryRunner.query(`
      CREATE TABLE "maintenance_logs" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "device_id" uuid NOT NULL REFERENCES "devices"("id") ON DELETE CASCADE,
        "type" maintenance_type_enum NOT NULL,
        "notes" varchar,
        "logged_by_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
        "performed_at" timestamptz NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now()
      );
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_maintenance_device_id" ON "maintenance_logs" ("device_id");`,
    );

    await queryRunner.query(`
      CREATE TYPE "metric_type_enum" AS ENUM (
        'co2', 'temperature', 'humidity', 'pm25', 'pm10', 'voc', 'co',
        'ph', 'turbidity', 'light_intensity', 'water_level', 'color_r', 'color_g', 'color_b'
      );
    `);
    await queryRunner.query(`
      CREATE TYPE "alert_severity_enum" AS ENUM ('green', 'amber', 'red');
    `);
    await queryRunner.query(`
      CREATE TABLE "alert_events" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "device_id" uuid NOT NULL REFERENCES "devices"("id") ON DELETE CASCADE,
        "metric_type" metric_type_enum NOT NULL,
        "severity" alert_severity_enum NOT NULL,
        "triggering_value" double precision NOT NULL,
        "message" varchar,
        "resolved_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now()
      );
    `);
    await queryRunner.query(`CREATE INDEX "idx_alerts_device_id" ON "alert_events" ("device_id");`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "alert_events";`);
    await queryRunner.query(`DROP TYPE IF EXISTS "alert_severity_enum";`);
    await queryRunner.query(`DROP TYPE IF EXISTS "metric_type_enum";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "maintenance_logs";`);
    await queryRunner.query(`DROP TYPE IF EXISTS "maintenance_type_enum";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "devices";`);
    await queryRunner.query(`DROP TYPE IF EXISTS "device_status_enum";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "users";`);
  }
}
