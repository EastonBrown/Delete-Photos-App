import { StatusBar } from "expo-status-bar";
import { useState } from "react";
import { View } from "react-native";
import { GroupReviewScreen } from "./src/screens/GroupReviewScreen";
import { ReviewScreen } from "./src/screens/ReviewScreen";
import { StartScreen } from "./src/screens/StartScreen";
import { SwipeScreen } from "./src/screens/SwipeScreen";
import { PhotoAsset } from "./src/types";

type Screen =
  | { name: "start" }
  | { name: "swipe"; sessionSize: number }
  | { name: "review"; candidates: PhotoAsset[] }
  | { name: "groupReview" };

export default function App() {
  const [screen, setScreen] = useState<Screen>({ name: "start" });

  return (
    <View style={{ flex: 1 }}>
      {/* Each screen unmounts on leaving, so returning to start re-runs StartScreen's
          refresh — that's what keeps the pending Similar Group count current. */}
      {screen.name === "start" && (
        <StartScreen
          onStartSession={(sessionSize) => setScreen({ name: "swipe", sessionSize })}
          onReviewSimilar={() => setScreen({ name: "groupReview" })}
        />
      )}
      {screen.name === "swipe" && (
        <SwipeScreen
          sessionSize={screen.sessionSize}
          onSessionComplete={(pendingDelete) =>
            setScreen({ name: "review", candidates: pendingDelete })
          }
        />
      )}
      {screen.name === "review" && (
        <ReviewScreen
          candidates={screen.candidates}
          onDone={() => setScreen({ name: "start" })}
        />
      )}
      {screen.name === "groupReview" && (
        <GroupReviewScreen onDone={() => setScreen({ name: "start" })} />
      )}
      <StatusBar style="light" />
    </View>
  );
}
