import { MigrationInterface, QueryRunner } from 'typeorm';

export class PushTokens1000000000008 implements MigrationInterface {
  name = 'PushTokens1000000000008';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "push_tokens" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "expo_push_token" varchar NOT NULL UNIQUE,
        "created_at" timestamptz NOT NULL DEFAULT now()
      );
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_push_tokens_user" ON "push_tokens" ("user_id");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "push_tokens";`);
  }
}
