import { StatusBar } from "expo-status-bar";
import { useState } from "react";
import { View } from "react-native";
import { ReviewScreen } from "./src/screens/ReviewScreen";
import { StartScreen } from "./src/screens/StartScreen";
import { SwipeScreen } from "./src/screens/SwipeScreen";
import { PhotoAsset } from "./src/types";

type Screen =
  | { name: "start" }
  | { name: "swipe"; sessionSize: number }
  | { name: "review"; candidates: PhotoAsset[] };

export default function App() {
  const [screen, setScreen] = useState<Screen>({ name: "start" });

  return (
    <View style={{ flex: 1 }}>
      {screen.name === "start" && (
        <StartScreen
          onStartSession={(sessionSize) => setScreen({ name: "swipe", sessionSize })}
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
      <StatusBar style="light" />
    </View>
  );
}
