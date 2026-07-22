import { Image } from "expo-image";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { deleteAssets } from "../lib/mediaLibrary";
import { markKept } from "../lib/photoQueue";
import { incrementDeleted, incrementKept } from "../lib/stats";
import { PhotoAsset } from "../types";

interface ReviewScreenProps {
  candidates: PhotoAsset[];
  onDone: () => void;
}

export function ReviewScreen({ candidates, onDone }: ReviewScreenProps) {
  const [toDelete, setToDelete] = useState<PhotoAsset[]>(candidates);
  const [busy, setBusy] = useState(false);

  const toggleKeep = (asset: PhotoAsset) => {
    setToDelete((current) => current.filter((a) => a.id !== asset.id));
  };

  const handleConfirm = async () => {
    if (toDelete.length === 0) {
      onDone();
      return;
    }
    setBusy(true);
    try {
      const success = await deleteAssets(toDelete.map((a) => a.id));
      if (success) {
        const kept = candidates.filter((a) => !toDelete.some((d) => d.id === a.id));
        await markKept(kept.map((a) => a.id));
        await incrementKept(kept.length);
        await incrementDeleted(toDelete.length);
        onDone();
      }
    } catch (err) {
      Alert.alert("Delete failed", err instanceof Error ? err.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  };

  if (candidates.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>Nothing marked for deletion</Text>
        <Pressable style={styles.button} onPress={onDone}>
          <Text style={styles.buttonText}>Done</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>
        Delete {toDelete.length} photo{toDelete.length === 1 ? "" : "s"}?
      </Text>
      <Text style={styles.subtitle}>Tap a photo to keep it instead.</Text>

      <FlatList
        data={candidates}
        keyExtractor={(item) => item.id}
        numColumns={3}
        contentContainerStyle={styles.grid}
        renderItem={({ item }) => {
          const marked = toDelete.some((a) => a.id === item.id);
          return (
            <Pressable
              style={styles.cell}
              onPress={() => (marked ? toggleKeep(item) : setToDelete((c) => [...c, item]))}
            >
              <Image source={{ uri: item.uri }} style={styles.thumb} contentFit="cover" />
              {!marked && (
                <View style={styles.keptOverlay}>
                  <Text style={styles.keptText}>KEPT</Text>
                </View>
              )}
            </Pressable>
          );
        }}
      />

      <Pressable style={styles.button} onPress={handleConfirm} disabled={busy}>
        {busy ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>
            {toDelete.length === 0 ? "Done" : `Delete ${toDelete.length} Photo${toDelete.length === 1 ? "" : "s"}`}
          </Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
    paddingTop: 60,
  },
  center: {
    flex: 1,
    backgroundColor: "#000",
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
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
  keptOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
  },
  keptText: {
    color: "#2ecc71",
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
  buttonText: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "700",
  },
});
