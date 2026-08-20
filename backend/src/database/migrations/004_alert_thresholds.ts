import { MigrationInterface, QueryRunner } from 'typeorm';

export class AlertThresholds1000000000004 implements MigrationInterface {
  name = 'AlertThresholds1000000000004';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "alert_thresholds" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "device_id" uuid NOT NULL REFERENCES "devices"("id") ON DELETE CASCADE,
        "metric_type" metric_type_enum NOT NULL,
        "green_min" double precision NOT NULL,
        "green_max" double precision NOT NULL,
        "amber_min" double precision NOT NULL,
        "amber_max" double precision NOT NULL
      );
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "idx_alert_thresholds_device_metric"
      ON "alert_thresholds" ("device_id", "metric_type");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "alert_thresholds";`);
  }
}
