import { Logger, type OnModuleDestroy } from '@nestjs/common';
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
import { TokensService } from '../auth/tokens.service.js';
import { AccountsService } from '../trading/accounts.service.js';
import { TradingEvents } from '../trading/events.js';
import { WS_OPTIONS } from './ws-options.js';

/**
 * Private account stream. Auth via `auth.token` (access JWT) in the handshake.
 * `subscribe {accountId}` → ack with a full snapshot + seq; then `order.update`, `position.update`,
 * `fill`, `account.update`, `account.status` events. Persisted events carry an increasing `seq`;
 * on a gap the client re-subscribes to get a fresh snapshot.
 */
@WebSocketGateway({ ...WS_OPTIONS, namespace: '/account' })
export class AccountGateway implements OnGatewayInit, OnGatewayConnection, OnModuleDestroy {
  private readonly logger = new Logger(AccountGateway.name);
  @WebSocketServer() server!: Namespace;
  private sub?: Subscription;

  constructor(
    private readonly tokens: TokensService,
    private readonly accounts: AccountsService,
    private readonly events: TradingEvents,
  ) {}

  afterInit() {
    this.sub = this.events.events$.subscribe((e) => {
      this.server
        .to(`a:${e.accountId}`)
        .emit(e.type, { accountId: e.accountId, seq: e.seq.toString(), data: e.payload });
    });
  }

  onModuleDestroy() {
    this.sub?.unsubscribe();
  }

  async handleConnection(socket: Socket) {
    const token = (socket.handshake.auth as { token?: unknown } | undefined)?.token;
    try {
      if (typeof token !== 'string') throw new Error('missing token');
      socket.data.user = await this.tokens.verifyAccess(token);
    } catch {
      socket.emit('auth.error', { code: 'TOKEN_INVALID' });
      socket.disconnect(true);
    }
  }

  @SubscribeMessage('subscribe')
  async subscribe(@ConnectedSocket() socket: Socket, @MessageBody() body: { accountId?: unknown }) {
    const user = socket.data.user as { id: string } | undefined;
    if (!user || typeof body?.accountId !== 'string') return { ok: false, code: 'BAD_REQUEST' };
    try {
      const [account, positions, orders] = await Promise.all([
        this.accounts.snapshot(user.id, body.accountId),
        this.accounts.positions(user.id, body.accountId),
        this.accounts.orders(user.id, body.accountId, 'open'),
      ]);
      for (const room of socket.rooms) if (room.startsWith('a:')) void socket.leave(room);
      void socket.join(`a:${body.accountId}`);
      return { ok: true, seq: account.seq, account, positions, orders };
    } catch {
      return { ok: false, code: 'ACCOUNT_NOT_FOUND' };
    }
  }
}
