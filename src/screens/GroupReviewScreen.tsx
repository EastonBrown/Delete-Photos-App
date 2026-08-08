import { Image } from "expo-image";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  advance,
  createGroupReviewSession,
  currentGroup,
  GroupReviewSessionState,
  isComplete,
  markedAssets,
  resolveGroups,
  toggleMark,
} from "../lib/groupReviewSession";
import { markKept } from "../lib/keptRegistry";
import { deleteAssets, getAssetInfo } from "../lib/mediaLibrary";
import { confirmReview } from "../lib/reviewSession";
import { setResolved } from "../lib/scanStatus";
import { getPendingGroups, removeGroup } from "../lib/similarGroups";
import { incrementDeleted, incrementKept } from "../lib/stats";
import { PhotoAsset } from "../types";

interface GroupReviewScreenProps {
  onDone: () => void;
}

// A group stops being pending in two stores at once: the pending-groups list and
// each member's Scan Status. Both have to move together, or members leak out of
// every review flow — see setResolved in scanStatus.ts.
//
// Scan Status first, deliberately: if the app dies between the two writes, members
// sit at `cleared` with the group still pending, which just replays this review.
// The other order strands them as `grouped` with no group to reach them.
async function retireGroup(ids: string[]): Promise<void> {
  await setResolved(ids);
  await removeGroup(ids);
}

export function GroupReviewScreen({ onDone }: GroupReviewScreenProps) {
  const [session, setSession] = useState<GroupReviewSessionState | null>(null);
  const [preview, setPreview] = useState<PhotoAsset | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const idGroups = await getPendingGroups();
        const uniqueIds = [...new Set(idGroups.flat())];
        const assets = await Promise.all(uniqueIds.map(getAssetInfo));

        const assetsById = new Map<string, PhotoAsset>();
        for (const asset of assets) {
          if (asset) assetsById.set(asset.id, asset);
        }

        const { reviewable, degenerate } = resolveGroups(idGroups, assetsById);
        // Groups that can never be reviewed shouldn't linger in the pending count.
        // Retiring them hands any lone survivor back to the normal per-photo queue.
        for (const ids of degenerate) await retireGroup(ids);

        setSession(createGroupReviewSession(reviewable));
      } catch {
        // An empty session still renders the "No similar photos" screen, which has a
        // way out. Leaving `session` null would strand the user on a spinner with no
        // exit — this screen is the only route back to start.
        setSession(createGroupReviewSession([]));
      }
    })();
  }, []);

  const handleConfirm = async () => {
    if (!session) return;
    const group = currentGroup(session);
    if (!group) return;

    setBusy(true);
    try {
      const result = await confirmReview(group.photos, markedAssets(session), {
        deleteAssets,
        markKept,
        incrementKept,
        incrementDeleted,
      });
      if (!result.ok) {
        Alert.alert("Delete failed", result.reason);
        return;
      }

      // The photos are already gone by here, so a bookkeeping failure must not
      // strand the session on a group that no longer exists — report and move on.
      try {
        await retireGroup(group.ids);
      } catch {
        Alert.alert("Couldn't update this group", "It may be offered for review again.");
      }

      const next = advance(session);
      setSession(next);
      if (isComplete(next)) onDone();
    } finally {
      setBusy(false);
    }
  };

  if (!session) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#fff" />
      </View>
    );
  }

  const group = currentGroup(session);

  if (!group) {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>No similar photos to review</Text>
        <Pressable style={styles.doneButton} onPress={onDone}>
          <Text style={styles.buttonText}>Done</Text>
        </Pressable>
      </View>
    );
  }

  const markedCount = session.marked.length;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={onDone}>
          <Text style={styles.headerButton}>End Session</Text>
        </Pressable>
        <Text style={styles.progress}>
          Group {session.index + 1} / {session.groups.length}
        </Text>
      </View>

      <Text style={styles.title}>
        {group.photos.length} similar photo{group.photos.length === 1 ? "" : "s"}
      </Text>
      <Text style={styles.subtitle}>
        Tap to mark for deletion · long-press to preview
      </Text>

      <FlatList
        data={group.photos}
        // Defensive: cells currently re-render anyway because renderItem below is an
        // inline arrow, so FlatList's PureComponent check always fails. Hoisting it
        // out (or enabling strictMode) would make this the only thing repainting the
        // mark overlays, which live in session.marked rather than in `data`.
        extraData={session.marked}
        keyExtractor={(item) => item.id}
        numColumns={3}
        contentContainerStyle={styles.grid}
        renderItem={({ item }) => {
          const marked = session.marked.includes(item.id);
          return (
            <Pressable
              style={styles.cell}
              // Updater form so the toggle composes from the latest state rather than
              // the render closure's copy — taps are discrete events that flush one at
              // a time, so this is idiom rather than a fix for an observed bug.
              onPress={() => setSession((state) => (state ? toggleMark(state, item.id) : state))}
              onLongPress={() => setPreview(item)}
            >
              <Image source={{ uri: item.uri }} style={styles.thumb} contentFit="cover" />
              {marked && (
                <View style={styles.deleteOverlay}>
                  <Text style={styles.deleteText}>DELETE</Text>
                </View>
              )}
            </Pressable>
          );
        }}
      />

      <Pressable
        style={[styles.button, markedCount === 0 && styles.keepAllButton]}
        onPress={handleConfirm}
        disabled={busy}
      >
        {busy ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>
            {markedCount === 0
              ? "Keep All"
              : `Delete ${markedCount} Photo${markedCount === 1 ? "" : "s"}`}
          </Text>
        )}
      </Pressable>

      <Modal visible={preview !== null} transparent animationType="fade">
        <Pressable style={styles.previewBackdrop} onPress={() => setPreview(null)}>
          {preview && (
            <Image source={{ uri: preview.uri }} style={styles.previewImage} contentFit="contain" />
          )}
        </Pressable>
      </Modal>
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
    gap: 16,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  headerButton: {
    color: "#3498db",
    fontSize: 16,
    fontWeight: "600",
  },
  progress: {
    color: "#888",
    fontSize: 14,
  },
  title: {
    fontSize: 22,
    fontWeight: "800",
    color: "#fff",
    textAlign: "center",
  },
  subtitle: {
    fontSize: 14,
    color: "#888",
    textAlign: "center",
    marginTop: 4,
    marginBottom: 12,
  },
  grid: {
    paddingHorizontal: 8,
  },
  cell: {
    flex: 1 / 3,
    aspectRatio: 1,
    margin: 2,
    borderRadius: 6,
    overflow: "hidden",
  },
  thumb: {
    width: "100%",
    height: "100%",
  },
  deleteOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#e74c3c",
    borderRadius: 6,
  },
  deleteText: {
    color: "#e74c3c",
    fontWeight: "800",
    fontSize: 12,
  },
  button: {
    backgroundColor: "#e74c3c",
    margin: 20,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
  },
  // Confirming with nothing marked keeps the whole group — not a destructive action.
  keepAllButton: {
    backgroundColor: "#2ecc71",
  },
  doneButton: {
    backgroundColor: "#3498db",
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  buttonText: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "700",
  },
  previewBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.92)",
    alignItems: "center",
    justifyContent: "center",
  },
  previewImage: {
    width: "92%",
    height: "80%",
  },
});
