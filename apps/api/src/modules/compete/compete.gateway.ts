import { type OnModuleDestroy } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  type OnGatewayConnection,
  type OnGatewayInit,
} from '@nestjs/websockets';
import type { Namespace, Socket } from 'socket.io';
import type { Subscription } from 'rxjs';
import { WS_OPTIONS } from '../realtime/ws-options.js';
import { CompeteTokensService, type CompetePlayerCtx } from './compete-auth.js';
import { CompeteService } from './compete.service.js';
import { CompeteEvents } from './events.js';

const LEADERBOARD_MS = 2_000;

/**
 * Compete stream (own namespace; player token in `auth.token`, compete tokens only).
 * `subscribe {roundId}` → ack with the leaderboard; then `leaderboard` every 2 s while live,
 * `round.update` on status changes and `entry.update` for the player's own entry.
 */
@WebSocketGateway({ ...WS_OPTIONS, namespace: '/compete' })
export class CompeteGateway implements OnGatewayInit, OnGatewayConnection, OnModuleDestroy {
  @WebSocketServer() server!: Namespace;
  private sub?: Subscription;
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly tokens: CompeteTokensService,
    private readonly compete: CompeteService,
    private readonly events: CompeteEvents,
  ) {}

  afterInit() {
    this.sub = this.events.events$.subscribe((e) => {
      if (e.type === 'round.update') this.server.to(`r:${e.roundId}`).emit('round.update', e);
      else this.server.to(`e:${e.entryId}`).emit('entry.update', e);
    });
    this.timer = setInterval(() => void this.pushLeaderboards(), LEADERBOARD_MS);
  }

  onModuleDestroy() {
    this.sub?.unsubscribe();
    if (this.timer) clearInterval(this.timer);
  }

  async handleConnection(socket: Socket) {
    const token = (socket.handshake.auth as { token?: unknown } | undefined)?.token;
    try {
      if (typeof token !== 'string') throw new Error('missing token');
      socket.data.player = await this.tokens.verifyAccess(token);
    } catch {
      socket.emit('auth.error', { code: 'TOKEN_INVALID' });
      socket.disconnect(true);
    }
  }

  @SubscribeMessage('subscribe')
  async subscribe(@ConnectedSocket() socket: Socket, @MessageBody() body: { roundId?: unknown }) {
    const p = socket.data.player as CompetePlayerCtx | undefined;
    if (!p || typeof body?.roundId !== 'string') return { ok: false, code: 'BAD_REQUEST' };
    try {
      const round = await this.compete.round(body.roundId, p.operatorId, p.id);
      for (const room of socket.rooms)
        if (room.startsWith('r:') || room.startsWith('e:')) void socket.leave(room);
      void socket.join(`r:${round.id}`);
      if (round.myEntry) void socket.join(`e:${round.myEntry.id}`);
      socket.data.roundId = round.id;
      return {
        ok: true,
        round,
        leaderboard: await this.compete.leaderboard(round.id, p.operatorId, p.id),
      };
    } catch {
      return { ok: false, code: 'ROUND_NOT_FOUND' };
    }
  }

  /** Per-socket leaderboard (marks the player's own row) for live rounds. */
  private async pushLeaderboards() {
    const sockets = await this.server.fetchSockets().catch(() => []);
    const live = new Map<string, boolean>();
    for (const s of sockets) {
      const p = s.data.player as CompetePlayerCtx | undefined;
      const roundId = s.data.roundId as string | undefined;
      if (!p || !roundId) continue;
      try {
        if (!live.has(roundId))
          live.set(roundId, (await this.compete.round(roundId, p.operatorId)).status === 'LIVE');
        if (!live.get(roundId)) continue;
        s.emit('leaderboard', await this.compete.leaderboard(roundId, p.operatorId, p.id));
      } catch {
        /* round gone or quote missing; next push */
      }
    }
  }
}
