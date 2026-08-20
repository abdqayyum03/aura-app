import { MigrationInterface, QueryRunner } from 'typeorm';

export class UserTokenVersion1000000000003 implements MigrationInterface {
  name = 'UserTokenVersion1000000000003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users" ADD COLUMN "token_version" integer NOT NULL DEFAULT 0;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "token_version";`);
  }
}
