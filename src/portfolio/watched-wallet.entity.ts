import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
} from "typeorm";

// An *additional* wallet linked to one identity. The identity is still the
// wallet you signed in with (the JWT `sub`), which is deliberately never stored
// here — it is implicit in every aggregate. Keeping it out of the table means
// there is exactly one source of truth for "who am I", so the combined
// portfolio can't double-count the signed-in wallet.
@Entity()
@Unique(["owner", "address"]) // linking the same address twice is meaningless
export class WatchedWallet {
  @PrimaryGeneratedColumn("uuid") id!: string;
  @Column() owner!: string; // JWT `sub` — the wallet that signed in
  @Column() address!: string; // the extra wallet being tracked under it
  @Column({ nullable: true }) label?: string; // free-text, e.g. "cold storage"
  @CreateDateColumn() createdAt!: Date;
}
