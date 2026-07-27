import { Column, CreateDateColumn, Entity, OneToOne, JoinColumn, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { PageAudit } from './page-audit.entity';

@Entity({ name: 'screenshots' })
@Unique('uq_screenshot_page', ['pageAuditId'])
export class Screenshot {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  pageAuditId!: string;

  @OneToOne(() => PageAudit, (p) => p.screenshot, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'pageAuditId' })
  pageAudit!: PageAudit;

  @Column({ type: 'text' })
  mime!: string;

  @Column({ type: 'bytea' })
  data!: Buffer;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}

