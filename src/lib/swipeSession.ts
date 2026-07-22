import { PhotoAsset, SwipeDecision, SwipeDirection } from "../types";

export interface SwipeSessionState {
  cards: PhotoAsset[];
  index: number;
  pendingDelete: PhotoAsset[];
  history: SwipeDecision[];
}

export type SwipeEffect =
  | { type: "markKept"; ids: string[] }
  | { type: "unmarkKept"; ids: string[] }
  | { type: "returnToQueue"; ids: string[] }
  | { type: "incrementKept"; delta: number }
  | { type: "incrementReviewed"; delta: number }
  | { type: "sessionComplete"; pendingDelete: PhotoAsset[] };

export interface SwipeSessionResult {
  state: SwipeSessionState;
  effects: SwipeEffect[];
}

export function createSwipeSession(cards: PhotoAsset[]): SwipeSessionState {
  return { cards, index: 0, pendingDelete: [], history: [] };
}

function withResult(state: SwipeSessionState, effects: SwipeEffect[]): SwipeSessionResult {
  return { state, effects };
}

function completionEffects(state: SwipeSessionState): SwipeEffect[] {
  return state.index >= state.cards.length
    ? [{ type: "sessionComplete", pendingDelete: state.pendingDelete }]
    : [];
}

export function applySwipe(
  state: SwipeSessionState,
  direction: SwipeDirection
): SwipeSessionResult {
  const asset = state.cards[state.index];
  if (!asset) return withResult(state, []);

  const index = state.index + 1;
  const pendingDelete =
    direction === "left" ? [...state.pendingDelete, asset] : state.pendingDelete;
  const history: SwipeDecision[] = [...state.history, { asset, direction }];
  const nextState: SwipeSessionState = { ...state, index, pendingDelete, history };

  const effects: SwipeEffect[] =
    direction === "right"
      ? [{ type: "markKept", ids: [asset.id] }, { type: "incrementKept", delta: 1 }]
      : [];
  effects.push({ type: "incrementReviewed", delta: 1 });
  effects.push(...completionEffects(nextState));

  return withResult(nextState, effects);
}

export function undo(state: SwipeSessionState): SwipeSessionResult {
  if (state.history.length === 0) return withResult(state, []);

  const last = state.history[state.history.length - 1];
  const history = state.history.slice(0, -1);
  const index = Math.max(0, state.index - 1);

  const effects: SwipeEffect[] = [];
  let pendingDelete = state.pendingDelete;
  if (last.direction === "right") {
    effects.push({ type: "unmarkKept", ids: [last.asset.id] });
    effects.push({ type: "incrementKept", delta: -1 });
  } else {
    pendingDelete = pendingDelete.slice(0, -1);
  }
  effects.push({ type: "incrementReviewed", delta: -1 });

  return withResult({ ...state, index, pendingDelete, history }, effects);
}

export function skip(state: SwipeSessionState): SwipeSessionResult {
  const asset = state.cards[state.index];
  if (!asset) return withResult(state, []);

  const nextState: SwipeSessionState = { ...state, index: state.index + 1 };
  const effects: SwipeEffect[] = [
    { type: "returnToQueue", ids: [asset.id] },
    ...completionEffects(nextState),
  ];

  return withResult(nextState, effects);
}

export function quit(state: SwipeSessionState): SwipeSessionResult {
  const remainingIds = state.cards.slice(state.index).map((a) => a.id);
  const effects: SwipeEffect[] = [
    { type: "returnToQueue", ids: remainingIds },
    { type: "sessionComplete", pendingDelete: state.pendingDelete },
  ];

  return withResult(state, effects);
}
