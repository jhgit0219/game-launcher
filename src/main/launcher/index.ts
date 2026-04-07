import { findGameById, updateGame, updatePlaytime } from '../db/games';
import { launchSteam } from './resolvers/steam';
import { launchEpic } from './resolvers/epic';
import { launchGog } from './resolvers/gog';
import { launchOrigin } from './resolvers/origin';
import { launchBattleNet } from './resolvers/battlenet';
import { launchDirect } from './resolvers/direct';

export interface LaunchResult {
  ok: boolean;
  error?: string;
  missingPath?: boolean;
  expectedPath?: string;
  session?: ActiveSession;
}

export interface ActiveSession {
  gameId: string;
  pid: number | null;
  startedAt: number; // Unix ms timestamp
}

export class GameLauncher {
  /** Currently tracked process sessions (direct launches only). */
  private sessions = new Map<string, ActiveSession>();

  async launch(gameId: string): Promise<LaunchResult> {
    const game = findGameById(gameId);
    if (!game) {
      return { ok: false, error: `Game not found: ${gameId}` };
    }

    // Record the launch time regardless of method.
    updateGame(game.id, { lastPlayed: new Date().toISOString() });

    const onExit = (session: ActiveSession) => this.handleSessionEnd(session);

    switch (game.platform) {
      case 'steam':
        return launchSteam(game);

      case 'epic':
        return launchEpic(game);

      case 'gog':
        return launchGog(game);

      case 'origin':
        return launchOrigin(game);

      case 'battlenet':
        return launchBattleNet(game);

      case 'registry':
      case 'custom': {
        const result = await launchDirect(game, onExit);
        if (result.ok && result.session) {
          this.sessions.set(gameId, result.session);
        }
        return result;
      }

      default: {
        // Exhaustive check — TypeScript will catch unhandled variants at compile time.
        const _exhaustive: never = game.platform;
        return { ok: false, error: `Unknown platform: ${String(_exhaustive)}` };
      }
    }
  }

  private handleSessionEnd(session: ActiveSession): void {
    this.sessions.delete(session.gameId);

    const durationMs = Date.now() - session.startedAt;
    const durationMins = Math.floor(durationMs / 60_000);

    if (durationMins > 0) {
      try {
        updatePlaytime(session.gameId, durationMins);
      } catch (err) {
        console.error('[launcher] Failed to record playtime:', err);
      }
    }
  }

  isRunning(gameId: string): boolean {
    return this.sessions.has(gameId);
  }

  activeSessions(): ActiveSession[] {
    return [...this.sessions.values()];
  }
}

export const gameLauncher = new GameLauncher();
