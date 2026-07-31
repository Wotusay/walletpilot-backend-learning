import { describe, it, expect, beforeEach, jest } from "@jest/globals";
import { Test } from "@nestjs/testing";
import { Subject } from "rxjs";
import { Server, Socket } from "socket.io";
import { PortfolioSnapshot } from "src/portfolio/portfolio.entity";
import { PortfolioGateway } from "./portfolio.gateway";
import { RefreshService } from "./refresh.service";

const ADDRESS = "5HZ8AEgxmnBwwmMKH4LZXxU5h6kGgq7XoWfgNHuGVpyU";
const OTHER = "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin";

function snapshot(address: string, id: string): PortfolioSnapshot {
  return {
    id,
    address,
    totalValue: 42,
    holdings: { SOL: { balance: 2, price: 21 } },
    createdAt: new Date(),
  } as PortfolioSnapshot;
}

// Minimal stand-in for a connected socket. join/leave really mutate `rooms`
// so the "switching address leaves the old room" assertion is meaningful.
function fakeClient(id = "client-1") {
  const rooms = new Set<string>([id]); // socket.io puts every socket in a room named after its id
  return {
    id,
    rooms,
    join: jest.fn((room: string) => {
      rooms.add(room);
    }),
    leave: jest.fn((room: string) => {
      rooms.delete(room);
    }),
  };
}

describe("PortfolioGateway", () => {
  let gateway: PortfolioGateway;
  let bus: Subject<PortfolioSnapshot>;
  let emit: jest.Mock<(event: string, payload: PortfolioSnapshot) => void>;
  let to: jest.Mock<(room: string) => { emit: typeof emit }>;

  beforeEach(async () => {
    jest.clearAllMocks();
    bus = new Subject<PortfolioSnapshot>();
    emit = jest.fn<(event: string, payload: PortfolioSnapshot) => void>();
    to = jest.fn<(room: string) => { emit: typeof emit }>(() => ({ emit }));

    const moduleRef = await Test.createTestingModule({
      providers: [
        PortfolioGateway,
        { provide: RefreshService, useValue: { snapshots: bus.asObservable() } },
      ],
    }).compile();

    gateway = moduleRef.get(PortfolioGateway);
    // Nest normally injects this when the socket.io adapter starts.
    gateway.server = { to } as unknown as Server;
    gateway.onModuleInit();
  });

  it("joins the room for the subscribed address", () => {
    const client = fakeClient();

    const ack = gateway.handleSubscribe(client as unknown as Socket, ADDRESS);

    expect(client.join).toHaveBeenCalledWith(`portfolio:${ADDRESS}`);
    expect(ack).toEqual({ event: "subscribed", data: ADDRESS });
  });

  // A client watches one wallet at a time — the old room must be dropped, but
  // the socket's own id-room must survive.
  it("leaves the previous portfolio room when switching address", () => {
    const client = fakeClient();

    gateway.handleSubscribe(client as unknown as Socket, ADDRESS);
    gateway.handleSubscribe(client as unknown as Socket, OTHER);

    expect(client.leave).toHaveBeenCalledWith(`portfolio:${ADDRESS}`);
    expect(client.rooms).toEqual(new Set(["client-1", `portfolio:${OTHER}`]));
  });

  it("leaves the portfolio room on unsubscribe", () => {
    const client = fakeClient();

    gateway.handleSubscribe(client as unknown as Socket, ADDRESS);
    gateway.handleUnsubscribe(client as unknown as Socket);

    expect(client.leave).toHaveBeenCalledWith(`portfolio:${ADDRESS}`);
    expect(client.rooms).toEqual(new Set(["client-1"]));
  });

  // The whole point of the room: a snapshot goes to that address only, never
  // as a global broadcast.
  it("emits each snapshot to its own address room", () => {
    const snap = snapshot(ADDRESS, "snap-1");

    bus.next(snap);

    expect(to).toHaveBeenCalledTimes(1);
    expect(to).toHaveBeenCalledWith(`portfolio:${ADDRESS}`);
    expect(emit).toHaveBeenCalledWith("snapshot", snap);
  });

  it("routes snapshots for different addresses to different rooms", () => {
    bus.next(snapshot(ADDRESS, "snap-1"));
    bus.next(snapshot(OTHER, "snap-2"));

    expect(to.mock.calls).toEqual([
      [`portfolio:${ADDRESS}`],
      [`portfolio:${OTHER}`],
    ]);
  });

  // Without unsubscribing, the bus keeps a reference to a dead gateway.
  it("stops emitting once the module is destroyed", () => {
    gateway.onModuleDestroy();

    bus.next(snapshot(ADDRESS, "snap-1"));

    expect(to).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
  });
});
