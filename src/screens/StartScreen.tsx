import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { AccessLevel, presentLimitedAccessPicker, requestAccess } from "../lib/mediaLibrary";
import { ensureQueue, rebuildQueue, remainingCount } from "../lib/photoQueue";
import { pendingGroupCount } from "../lib/similarGroups";
import {
  getSortMode,
  setSortMode as persistSortMode,
  SortMode,
} from "../lib/sortPreference";
import { getStats, Stats } from "../lib/stats";

const SESSION_SIZE_OPTIONS = [10, 20, 30, 50];

const SORT_MODE_OPTIONS: { mode: SortMode; label: string }[] = [
  { mode: "random", label: "Shuffled" },
  { mode: "oldestFirst", label: "Oldest first" },
  { mode: "newestFirst", label: "Newest first" },
];

interface StartScreenProps {
  onStartSession: (sessionSize: number) => void;
  onReviewSimilar: () => void;
}

export function StartScreen({ onStartSession, onReviewSimilar }: StartScreenProps) {
  const [access, setAccess] = useState<AccessLevel | "loading">("loading");
  const [remaining, setRemaining] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [sortMode, setSortModeState] = useState<SortMode>("random");
  const [sessionSize, setSessionSize] = useState(30);
  const [stats, setStats] = useState<Stats | null>(null);
  const [groupCount, setGroupCount] = useState(0);

  const refresh = useCallback(async () => {
    setBusy(true);
    try {
      const [level, mode, statsResult] = await Promise.all([
        requestAccess(),
        getSortMode(),
        getStats(),
      ]);
      setAccess(level);
      setSortModeState(mode);
      setStats(statsResult);
      if (level !== "none") {
        // ensureQueue runs the Similarity Scan's pool top-up, which can create new
        // Similar Groups — so the pending count has to be read after it, not with it.
        const count = await ensureQueue();
        setRemaining(count);
        setGroupCount(await pendingGroupCount());
      }
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // rebuildQueue also tops up the pool, so both counts move together.
  const rebuild = async (mode?: SortMode) => {
    setRemaining(await rebuildQueue(mode));
    setGroupCount(await pendingGroupCount());
  };

  const handleRebuild = async () => {
    setBusy(true);
    try {
      await rebuild();
    } finally {
      setBusy(false);
    }
  };

  const handleSortModeChange = async (mode: SortMode) => {
    if (mode === sortMode) return;
    setBusy(true);
    try {
      await persistSortMode(mode);
      setSortModeState(mode);
      await rebuild(mode);
    } finally {
      setBusy(false);
    }
  };

  const handleSelectMore = async () => {
    await presentLimitedAccessPicker();
    refresh();
  };

  if (access === "loading" || busy) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#fff" />
      </View>
    );
  }

  if (access === "none") {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Photo Access Needed</Text>
        <Text style={styles.subtitle}>
          This app needs access to your photos to let you review and delete them.
        </Text>
        <Pressable style={styles.button} onPress={() => Linking.openSettings()}>
          <Text style={styles.buttonText}>Open Settings</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Delete Photos</Text>

      {stats && (stats.reviewed > 0 || stats.deleted > 0) && (
        <Text style={styles.statsText}>
          {stats.reviewed} reviewed · {stats.kept} kept · {stats.deleted} deleted
        </Text>
      )}

      {access === "limited" && (
        <View style={styles.limitedBanner}>
          <Text style={styles.limitedText}>
            You've only given this app access to some of your photos.
          </Text>
          <Pressable style={styles.linkButton} onPress={handleSelectMore}>
            <Text style={styles.linkButtonText}>Select More Photos</Text>
          </Pressable>
        </View>
      )}

      <View style={styles.optionRow}>
        {SORT_MODE_OPTIONS.map((option) => (
          <Pressable
            key={option.mode}
            style={[styles.optionChip, sortMode === option.mode && styles.optionChipActive]}
            onPress={() => handleSortModeChange(option.mode)}
          >
            <Text
              style={[
                styles.optionChipText,
                sortMode === option.mode && styles.optionChipTextActive,
              ]}
            >
              {option.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {groupCount > 0 && (
        <View style={styles.similarBanner}>
          <Text style={styles.similarText}>
            {groupCount} group{groupCount === 1 ? "" : "s"} of similar photos found
          </Text>
          <Pressable style={styles.similarButton} onPress={onReviewSimilar}>
            <Text style={styles.buttonText}>Review Similar Photos</Text>
          </Pressable>
        </View>
      )}

      {remaining === 0 ? (
        <>
          <Text style={styles.subtitle}>You're all caught up! No unreviewed photos left.</Text>
          <Pressable style={styles.secondaryButton} onPress={handleRebuild}>
            <Text style={styles.buttonText}>Check for New Photos</Text>
          </Pressable>
        </>
      ) : (
        <>
          <Text style={styles.subtitle}>{remaining} photos left to review</Text>

          <View style={styles.optionRow}>
            {SESSION_SIZE_OPTIONS.map((size) => (
              <Pressable
                key={size}
                style={[styles.optionChip, sessionSize === size && styles.optionChipActive]}
                onPress={() => setSessionSize(size)}
              >
                <Text
                  style={[
                    styles.optionChipText,
                    sessionSize === size && styles.optionChipTextActive,
                  ]}
                >
                  {size}
                </Text>
              </Pressable>
            ))}
          </View>

          <Pressable style={styles.button} onPress={() => onStartSession(sessionSize)}>
            <Text style={styles.buttonText}>Start Session</Text>
          </Pressable>
          <Pressable style={styles.secondaryButton} onPress={handleRebuild}>
            <Text style={styles.secondaryButtonText}>Check for New Photos</Text>
          </Pressable>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 16,
  },
  title: {
    fontSize: 32,
    fontWeight: "800",
    color: "#fff",
  },
  statsText: {
    fontSize: 13,
    color: "#666",
    marginTop: -12,
  },
  subtitle: {
    fontSize: 16,
    color: "#ccc",
    textAlign: "center",
  },
  button: {
    backgroundColor: "#2ecc71",
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 12,
  },
  buttonText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "700",
  },
  secondaryButton: {
    paddingVertical: 10,
    paddingHorizontal: 24,
  },
  secondaryButtonText: {
    color: "#888",
    fontSize: 14,
  },
  similarBanner: {
    alignItems: "center",
    gap: 10,
  },
  similarText: {
    color: "#ccc",
    fontSize: 15,
    textAlign: "center",
  },
  similarButton: {
    backgroundColor: "#3498db",
    paddingVertical: 12,
    paddingHorizontal: 28,
    borderRadius: 12,
  },
  limitedBanner: {
    backgroundColor: "#222",
    padding: 16,
    borderRadius: 12,
    alignItems: "center",
    gap: 8,
  },
  limitedText: {
    color: "#ccc",
    textAlign: "center",
  },
  linkButton: {
    paddingVertical: 6,
  },
  linkButtonText: {
    color: "#3498db",
    fontWeight: "600",
  },
  optionRow: {
    flexDirection: "row",
    gap: 8,
  },
  optionChip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#444",
  },
  optionChipActive: {
    backgroundColor: "#2ecc71",
    borderColor: "#2ecc71",
  },
  optionChipText: {
    color: "#aaa",
    fontSize: 13,
    fontWeight: "600",
  },
  optionChipTextActive: {
    color: "#000",
  },
});
