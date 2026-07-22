import * as Haptics from "expo-haptics";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { SwipeCard } from "../components/SwipeCard";
import { getAssetInfo } from "../lib/mediaLibrary";
import { markKept, returnToQueue, takeNextBatch, unmarkKept } from "../lib/photoQueue";
import { incrementKept, incrementReviewed } from "../lib/stats";
import { PhotoAsset, SwipeDirection } from "../types";

const DEFAULT_SESSION_SIZE = 30;

interface SwipeScreenProps {
  sessionSize?: number;
  onSessionComplete: (pendingDelete: PhotoAsset[]) => void;
}

interface Decision {
  asset: PhotoAsset;
  direction: SwipeDirection;
}

export function SwipeScreen({
  sessionSize = DEFAULT_SESSION_SIZE,
  onSessionComplete,
}: SwipeScreenProps) {
  const [cards, setCards] = useState<PhotoAsset[] | null>(null);
  const [index, setIndex] = useState(0);
  const pendingDeleteRef = useRef<PhotoAsset[]>([]);
  const historyRef = useRef<Decision[]>([]);
  const [historyLength, setHistoryLength] = useState(0);

  useEffect(() => {
    (async () => {
      const ids = await takeNextBatch(sessionSize);
      const assets = await Promise.all(ids.map(getAssetInfo));
      const valid = assets.filter((a): a is PhotoAsset => a !== null);
      setCards(valid);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const finishSession = () => {
    onSessionComplete(pendingDeleteRef.current);
  };

  const handleSwiped = async (asset: PhotoAsset, direction: SwipeDirection) => {
    if (direction === "right") {
      await markKept([asset.id]);
      await incrementKept(1);
    } else {
      pendingDeleteRef.current = [...pendingDeleteRef.current, asset];
    }
    await incrementReviewed(1);
    historyRef.current = [...historyRef.current, { asset, direction }];
    setHistoryLength(historyRef.current.length);

    const nextIndex = index + 1;
    if (cards && nextIndex >= cards.length) {
      finishSession();
    } else {
      setIndex(nextIndex);
    }
  };

  const handleUndo = async () => {
    if (historyRef.current.length === 0) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const last = historyRef.current[historyRef.current.length - 1];
    historyRef.current = historyRef.current.slice(0, -1);
    setHistoryLength(historyRef.current.length);

    if (last.direction === "right") {
      await unmarkKept([last.asset.id]);
      await incrementKept(-1);
    } else {
      pendingDeleteRef.current = pendingDeleteRef.current.slice(0, -1);
    }
    await incrementReviewed(-1);
    setIndex((i) => Math.max(0, i - 1));
  };

  const handleSkip = async () => {
    if (!cards) return;
    const asset = cards[index];
    if (!asset) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await returnToQueue([asset.id]);

    const nextIndex = index + 1;
    if (nextIndex >= cards.length) {
      finishSession();
    } else {
      setIndex(nextIndex);
    }
  };

  const handleQuit = async () => {
    if (!cards) return;
    const remainingIds = cards.slice(index).map((a) => a.id);
    await returnToQueue(remainingIds);
    finishSession();
  };

  if (!cards) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#fff" />
      </View>
    );
  }

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
          <Pressable onPress={handleUndo} disabled={historyLength === 0}>
            <Text style={[styles.headerButton, historyLength === 0 && styles.disabled]}>
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
              onSwiped={(direction) => handleSwiped(asset, direction)}
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
