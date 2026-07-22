import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { useMemo, useRef } from "react";
import { Animated, Dimensions, PanResponder, StyleSheet, Text } from "react-native";
import { resolveSwipe } from "../lib/resolveSwipe";
import { PhotoAsset, SwipeDirection } from "../types";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const SWIPE_THRESHOLD = SCREEN_WIDTH * 0.3;

interface SwipeCardProps {
  asset: PhotoAsset;
  isTop: boolean;
  stackOffset: number;
  onSwiped: (direction: SwipeDirection) => void;
}

export function SwipeCard({ asset, isTop, stackOffset, onSwiped }: SwipeCardProps) {
  const position = useRef(new Animated.ValueXY()).current;

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => isTop,
        onMoveShouldSetPanResponder: () => isTop,
        onPanResponderMove: Animated.event([null, { dx: position.x, dy: position.y }], {
          useNativeDriver: false,
        }),
        onPanResponderRelease: (_event, gesture) => {
          const direction = resolveSwipe(gesture.dx, gesture.vx, SWIPE_THRESHOLD);

          if (!direction) {
            Animated.spring(position, {
              toValue: { x: 0, y: 0 },
              useNativeDriver: false,
            }).start();
            return;
          }

          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          Animated.timing(position, {
            toValue: {
              x: Math.sign(gesture.dx) * SCREEN_WIDTH * 1.5,
              y: gesture.dy,
            },
            duration: 250,
            useNativeDriver: false,
          }).start(() => onSwiped(direction));
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isTop]
  );

  const rotate = position.x.interpolate({
    inputRange: [-SCREEN_WIDTH, SCREEN_WIDTH],
    outputRange: ["-12deg", "12deg"],
  });

  const keepOpacity = position.x.interpolate({
    inputRange: [0, SWIPE_THRESHOLD],
    outputRange: [0, 1],
    extrapolate: "clamp",
  });

  const deleteOpacity = position.x.interpolate({
    inputRange: [-SWIPE_THRESHOLD, 0],
    outputRange: [1, 0],
    extrapolate: "clamp",
  });

  const cardStyle = {
    transform: [
      { translateX: position.x },
      { translateY: position.y },
      { rotate },
      { scale: isTop ? 1 : 0.95 },
    ],
    top: isTop ? 0 : stackOffset,
  };

  return (
    <Animated.View
      style={[styles.card, cardStyle]}
      {...(isTop ? panResponder.panHandlers : {})}
    >
      <Image source={{ uri: asset.uri }} style={styles.image} contentFit="contain" />
      {isTop && (
        <>
          <Animated.View style={[styles.badge, styles.keepBadge, { opacity: keepOpacity }]}>
            <Text style={styles.badgeText}>KEEP</Text>
          </Animated.View>
          <Animated.View style={[styles.badge, styles.deleteBadge, { opacity: deleteOpacity }]}>
            <Text style={styles.badgeText}>DELETE</Text>
          </Animated.View>
        </>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    position: "absolute",
    width: SCREEN_WIDTH - 40,
    height: "100%",
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: "#111",
  },
  image: {
    width: "100%",
    height: "100%",
  },
  badge: {
    position: "absolute",
    top: 40,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderWidth: 3,
    borderRadius: 8,
  },
  keepBadge: {
    left: 20,
    borderColor: "#2ecc71",
    transform: [{ rotate: "-15deg" }],
  },
  deleteBadge: {
    right: 20,
    borderColor: "#e74c3c",
    transform: [{ rotate: "15deg" }],
  },
  badgeText: {
    fontSize: 24,
    fontWeight: "800",
    color: "#fff",
  },
});
