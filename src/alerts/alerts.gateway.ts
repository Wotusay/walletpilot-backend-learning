import { Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import { Subscription } from "rxjs";
import { Server, Socket } from "socket.io";
import { Alert } from "./alert.entity";
import { AlertsService } from "./alerts.service";

// Shares the default namespace with PortfolioGateway so the page keeps ONE
// socket connection. That only works because the event names are distinct —
// "subscribeAlerts"/"alert" here vs "subscribe"/"snapshot" there.
//
// Note: like PortfolioGateway, the room key is whatever the client sends; the
// socket handshake carries no JWT. Same trust level as the portfolio stream —
// fine for this app, but it is a real choice, not an oversight.
@WebSocketGateway()
export class AlertsGateway implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AlertsGateway.name);

  @WebSocketServer()
  server!: Server;

  private busSubscription?: Subscription;

  constructor(private readonly alertsService: AlertsService) {}

  // One room per owner — an alert belongs to whoever armed the rule, not to
  // everyone watching that address.
  private room(owner: string): string {
    return `alerts:${owner}`;
  }

  onModuleInit(): void {
    this.busSubscription = this.alertsService.stream.subscribe(
      (alert: Alert) => {
        this.server.to(this.room(alert.owner)).emit("alert", alert);
      },
    );
  }

  onModuleDestroy(): void {
    this.busSubscription?.unsubscribe();
  }

  @SubscribeMessage("subscribeAlerts")
  handleSubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() owner: string,
  ): { event: string; data: string } {
    this.leaveAlertRooms(client);
    client.join(this.room(owner));
    this.logger.log(`Client ${client.id} subscribed to alerts for ${owner}`);
    return { event: "alertsSubscribed", data: owner };
  }

  @SubscribeMessage("unsubscribeAlerts")
  handleUnsubscribe(@ConnectedSocket() client: Socket): {
    event: string;
    data: string;
  } {
    this.leaveAlertRooms(client);
    return { event: "alertsUnsubscribed", data: client.id };
  }

  // Copy first: leave() mutates the set we're iterating. Only alerts:* rooms
  // are dropped — the socket's own id-room and any portfolio:* room stay.
  private leaveAlertRooms(client: Socket): void {
    for (const room of [...client.rooms]) {
      if (room.startsWith("alerts:")) client.leave(room);
    }
  }
}
