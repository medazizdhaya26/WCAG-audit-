import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { PageAudit } from './page-audit.entity';
import { AuditHistory } from './audit-history.entity';
import { WebsiteAuditStatus } from './enums';

@Entity({ name: 'website_audits' })
@Index(['status', 'startedAt'])
export class WebsiteAudit {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  // Propriétaire de l'audit (sub du JWT Keycloak). Null = audit anonyme (avant activation auth).
  @Index()
  @Column({ type: 'text', nullable: true })
  ownerId!: string | null;

  @Column({ type: 'text' })
  rootUrl!: string;

  @Column({ type: 'text' })
  normalizedRootUrl!: string;

  @Column({ type: 'enum', enum: WebsiteAuditStatus, default: WebsiteAuditStatus.QUEUED })
  status!: WebsiteAuditStatus;

  @Column({ type: 'int', default: 3 })
  maxDepth!: number;

  @Column({ type: 'int', default: 200 })
  maxPages!: number;

  @Column({ type: 'boolean', default: true })
  renderJs!: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  startedAt!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  finishedAt!: Date | null;

  @Column({ type: 'int', default: 0 })
  pagesDiscovered!: number;

  @Column({ type: 'int', default: 0 })
  pagesQueued!: number;

  @Column({ type: 'int', default: 0 })
  pagesCompleted!: number;

  @Column({ type: 'int', default: 0 })
  pagesFailed!: number;

  @Column({ type: 'int', default: 0 })
  pagesSkipped!: number;

  @Column({ type: 'float', nullable: true })
  globalScore!: number | null;

  @Column({ type: 'jsonb', nullable: true })
  summary!: any | null;

  @Column({ type: 'text', nullable: true })
  errorMessage!: string | null;

  @OneToMany(() => PageAudit, (p) => p.websiteAudit)
  pages!: PageAudit[];

  @OneToMany(() => AuditHistory, (h) => h.websiteAudit)
  history!: AuditHistory[];

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}

