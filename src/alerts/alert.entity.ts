import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from "typeorm";
import { WatchlistRule } from "./watchlist.entity";

// One fired alert. Every field the rule had at firing time is copied in rather
// than joined: `watchlistId` is a plain column, not a foreign key, so deleting a
// rule keeps the history of what it already caught.
@Entity()
export class Alert {
  @PrimaryGeneratedColumn("uuid") id!: string;
  @Column() owner!: string;
  @Column() address!: string;
  @Column() watchlistId!: string;
  @Column({ type: "enum", enum: WatchlistRule }) rule!: WatchlistRule;
  @Column("float") threshold!: number;
  @Column("float") observedValue!: number;
  @Column() message!: string;
  @CreateDateColumn() createdAt!: Date;
}
