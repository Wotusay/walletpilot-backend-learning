import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from "typeorm";

// The four rules a user can arm. BELOW/ABOVE are strict comparisons, so a value
// landing exactly on the threshold counts as "not breached".
export enum WatchlistRule {
  SolBalanceBelow = "SOL_BALANCE_BELOW",
  SolBalanceAbove = "SOL_BALANCE_ABOVE",
  TotalValueBelow = "TOTAL_VALUE_BELOW",
  TotalValueAbove = "TOTAL_VALUE_ABOVE",
}

@Entity()
export class Watchlist {
  @PrimaryGeneratedColumn("uuid") id!: string;
  @Column() owner!: string; // JWT `sub` — the wallet that registered the rule
  @Column() address!: string; // the wallet being watched (may differ from owner)
  @Column({ type: "enum", enum: WatchlistRule }) rule!: WatchlistRule;
  @Column("float") threshold!: number;
  @Column({ default: true }) active!: boolean;
  // Edge-trigger state: true while the rule is currently breached. Without it a
  // wallet parked below its threshold would fire an alert every single minute.
  // See AlertsService.evaluate().
  @Column({ default: false }) breached!: boolean;
  @CreateDateColumn() createdAt!: Date;
}
