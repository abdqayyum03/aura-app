import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

// One row per (user, app installation). A user can have more than one -
// the app installed on two phones registers two tokens, both notified on
// the same alert. expoPushToken is globally unique (not per-user-unique):
// re-registering the same token under a different account (e.g. someone
// logs out and a different account logs in on the same physical phone)
// re-points that one row at the new owner rather than creating a duplicate
// - see NotificationsService.registerToken.
@Entity('push_tokens')
export class PushToken {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  @Index()
  userId: string;

  @Column({ name: 'expo_push_token', unique: true })
  expoPushToken: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
