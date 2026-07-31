import { Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import { Subscription } from "rxjs";
import { Server, Socket } from "socket.io";
import { PortfolioSnapshot } from "src/portfolio/portfolio.entity";
import { RefreshService } from "./refresh.service";

// No `cors` option: the page is served from the same origin as the API
// (main.ts serves public/), so socket.io's default same-origin policy is fine.
@WebSocketGateway()
export class PortfolioGateway
  implements OnModuleInit, OnModuleDestroy, OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(PortfolioGateway.name);

  // Injected by Nest once the socket.io server is attached to the HTTP server.
  @WebSocketServer()
  server!: Server;

  private busSubscription?: Subscription;

  constructor(private readonly refreshService: RefreshService) {}

  // One room per wallet — this is what keeps a snapshot from reaching clients
  // that are watching a different address.
  private room(address: string): string {
    return `portfolio:${address}`;
  }

  // Subscribe to the same in-process bus that feeds SSE, and fan each snapshot
  // out to its address room. The gateway depends on RefreshService (not the
  // other way round), so the service stays transport-agnostic.
  onModuleInit(): void {
    this.busSubscription = this.refreshService.snapshots.subscribe(
      (snapshot: PortfolioSnapshot) => {
        this.server.to(this.room(snapshot.address)).emit("snapshot", snapshot);
      },
    );
  }

  // Without this the subscription outlives the module (leaks between tests).
  onModuleDestroy(): void {
    this.busSubscription?.unsubscribe();
  }

  handleConnection(client: Socket): void {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket): void {
    // socket.io removes the client from its rooms automatically.
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  // Watch one address. A client only ever watches one at a time, so any
  // previously joined portfolio room is left first.
  @SubscribeMessage("subscribe")
  handleSubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() address: string,
  ): { event: string; data: string } {
    this.leavePortfolioRooms(client);
    client.join(this.room(address));
    this.logger.log(`Client ${client.id} subscribed to ${address}`);
    // Returned object is delivered as the ack to the client's emit().
    return { event: "subscribed", data: address };
  }

  @SubscribeMessage("unsubscribe")
  handleUnsubscribe(@ConnectedSocket() client: Socket): {
    event: string;
    data: string;
  } {
    this.leavePortfolioRooms(client);
    return { event: "unsubscribed", data: client.id };
  }

  // Every socket is also a member of a room named after its own id — skip that
  // one and only drop the portfolio:* rooms.
  private leavePortfolioRooms(client: Socket): void {
    // Copy first: leave() mutates the set we're iterating.
    for (const room of [...client.rooms]) {
      if (room.startsWith("portfolio:")) client.leave(room);
    }
  }
}
