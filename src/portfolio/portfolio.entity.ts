import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from "typeorm";

@Entity()
export class PortfolioSnapshot {
  @PrimaryGeneratedColumn("uuid") id!: string;
  @Column() address!: string;
  @Column("float") totalValue!: number;
  @Column("jsonb") holdings!: any;
  @CreateDateColumn() createdAt!: Date;
}
