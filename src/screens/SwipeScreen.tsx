import * as Haptics from "expo-haptics";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { SwipeCard } from "../components/SwipeCard";
import { getAssetInfo } from "../lib/mediaLibrary";
import { markKept, returnToQueue, takeNextBatch, unmarkKept } from "../lib/photoQueue";
import {
  applySwipe,
  createSwipeSession,
  quit,
  skip,
  SwipeEffect,
  SwipeSessionState,
  undo,
} from "../lib/swipeSession";
import { incrementKept, incrementReviewed } from "../lib/stats";
import { PhotoAsset, SwipeDirection } from "../types";

const DEFAULT_SESSION_SIZE = 30;

interface SwipeScreenProps {
  sessionSize?: number;
  onSessionComplete: (pendingDelete: PhotoAsset[]) => void;
}

export function SwipeScreen({
  sessionSize = DEFAULT_SESSION_SIZE,
  onSessionComplete,
}: SwipeScreenProps) {
  const [session, setSession] = useState<SwipeSessionState | null>(null);

  useEffect(() => {
    (async () => {
      const ids = await takeNextBatch(sessionSize);
      const assets = await Promise.all(ids.map(getAssetInfo));
      const valid = assets.filter((a): a is PhotoAsset => a !== null);
      setSession(createSwipeSession(valid));
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runEffects = async (effects: SwipeEffect[]) => {
    for (const effect of effects) {
      switch (effect.type) {
        case "markKept":
          await markKept(effect.ids);
          break;
        case "unmarkKept":
          await unmarkKept(effect.ids);
          break;
        case "returnToQueue":
          await returnToQueue(effect.ids);
          break;
        case "incrementKept":
          await incrementKept(effect.delta);
          break;
        case "incrementReviewed":
          await incrementReviewed(effect.delta);
          break;
        case "sessionComplete":
          onSessionComplete(effect.pendingDelete);
          break;
      }
    }
  };

  const handleSwiped = async (direction: SwipeDirection) => {
    if (!session) return;
    const result = applySwipe(session, direction);
    setSession(result.state);
    await runEffects(result.effects);
  };

  const handleUndo = async () => {
    if (!session || session.history.length === 0) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const result = undo(session);
    setSession(result.state);
    await runEffects(result.effects);
  };

  const handleSkip = async () => {
    if (!session) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const result = skip(session);
    setSession(result.state);
    await runEffects(result.effects);
  };

  const handleQuit = async () => {
    if (!session) return;
    const result = quit(session);
    setSession(result.state);
    await runEffects(result.effects);
  };

  if (!session) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#fff" />
      </View>
    );
  }

  const { cards, index, history } = session;
  const visible = cards.slice(index, index + 2);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={handleQuit}>
          <Text style={styles.headerButton}>End Session</Text>
        </Pressable>
        <Text style={styles.progress}>
          {Math.min(index + 1, cards.length)} / {cards.length}
        </Text>
        <View style={styles.headerRight}>
          <Pressable onPress={handleSkip}>
            <Text style={styles.headerButton}>Skip</Text>
          </Pressable>
          <Pressable onPress={handleUndo} disabled={history.length === 0}>
            <Text style={[styles.headerButton, history.length === 0 && styles.disabled]}>
              Undo
            </Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.cardArea}>
        {visible
          .map((asset, i) => (
            <SwipeCard
              key={asset.id}
              asset={asset}
              isTop={i === 0}
              stackOffset={i * 8}
              onSwiped={handleSwiped}
            />
          ))
          .reverse()}
      </View>

      <View style={styles.hints}>
        <Text style={styles.hintText}>← swipe left to delete · swipe right to keep →</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  center: {
    flex: 1,
    backgroundColor: "#000",
    alignItems: "center",
    justifyContent: "center",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  headerRight: {
    flexDirection: "row",
    gap: 16,
  },
  headerButton: {
    color: "#3498db",
    fontSize: 16,
    fontWeight: "600",
  },
  disabled: {
    color: "#555",
  },
  progress: {
    color: "#888",
    fontSize: 14,
  },
  cardArea: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  hints: {
    paddingBottom: 30,
    alignItems: "center",
  },
  hintText: {
    color: "#666",
    fontSize: 13,
  },
});
