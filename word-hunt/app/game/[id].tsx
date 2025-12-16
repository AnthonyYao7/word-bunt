import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  GestureResponderEvent,
} from "react-native";

export default function GameScreen() {
  const router = useRouter();
  const { id, username } = useLocalSearchParams<{ id: string; username?: string }>();
  const [board, setBoard] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gridSize, setGridSize] = useState(0);
  const [cellSize, setCellSize] = useState(0);
  const [path, setPath] = useState<number[]>([]);
  const [gridPosition, setGridPosition] = useState({ x: 0, y: 0 });
  const gridRef = useRef<View>(null);
  const LINE_THICKNESS = 4;

  const API_BASE =
    process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, "") || "http://localhost:8000";

  const letters = useMemo(() => {
    if (board && board.length >= 16) {
      return board.slice(0, 16).split("");
    }
    return "ABCDEFGHIJKLMNOP".split("");
  }, [board]);

  useEffect(() => {
    const loadGame = async () => {
      if (!id) return;
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`${API_BASE}/game?game_id=${id}`);
        if (!res.ok) {
          throw new Error(`Failed to load game (${res.status})`);
        }
        const body = await res.json();
        setBoard(body?.board ?? null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not load game.");
      } finally {
        setLoading(false);
      }
    };
    loadGame();
  }, [API_BASE, id]);

  const measureGrid = useCallback(() => {
    if (gridRef.current) {
      gridRef.current.measure((x, y, width, height, pageX, pageY) => {
        setGridPosition({ x: pageX, y: pageY });
        setGridSize(width);
        setCellSize(width / 4);
      });
    }
  }, []);

  const locationToIndex = useCallback(
    (evt: GestureResponderEvent) => {
      if (!gridSize || !cellSize) return -1;
      const { pageX, pageY } = evt.nativeEvent;
      
      const relativeX = pageX - gridPosition.x;
      const relativeY = pageY - gridPosition.y;
      
      if (
        relativeX < 0 ||
        relativeY < 0 ||
        relativeX > gridSize ||
        relativeY > gridSize
      ) {
        return -1;
      }

      const col = Math.floor(relativeX / cellSize);
      const row = Math.floor(relativeY / cellSize);
      
      if (col < 0 || col > 3 || row < 0 || row > 3) return -1;
      return row * 4 + col;
    },
    [cellSize, gridSize, gridPosition]
  );

  const onWordComplete = useCallback(
    (word: string, indices: number[]) => {
      console.log("Word traced:", word, "indices:", indices);
    },
    []
  );

  const getCellCenter = useCallback(
    (idx: number) => {
      const row = Math.floor(idx / 4);
      const col = idx % 4;
      return {
        x: col * cellSize + cellSize / 2,
        y: row * cellSize + cellSize / 2,
      };
    },
    [cellSize]
  );

  const handleStart = useCallback(
    (evt: GestureResponderEvent, _gestureState?: any) => {
      measureGrid(); // Re-measure on touch to ensure accuracy
      const idx = locationToIndex(evt);
      if (idx === -1) return;
      setPath([idx]);
    },
    [locationToIndex, measureGrid]
  );

  const handleMove = useCallback(
    (evt: GestureResponderEvent, _gestureState?: any) => {
      const idx = locationToIndex(evt);
      if (idx === -1) return;

      // Only allow selecting a new cell if it is adjacent/diagonal to the last one
      const isAdjacentToLast = (nextIdx: number, currentPath: number[]) => {
        if (currentPath.length === 0) return true;
        const lastIdx = currentPath[currentPath.length - 1];
        const lastRow = Math.floor(lastIdx / 4);
        const lastCol = lastIdx % 4;
        const nextRow = Math.floor(nextIdx / 4);
        const nextCol = nextIdx % 4;
        return Math.abs(lastRow - nextRow) <= 1 && Math.abs(lastCol - nextCol) <= 1;
      };

      setPath((current) => {
        if (current.includes(idx)) return current;
        if (!isAdjacentToLast(idx, current)) return current;
        return [...current, idx];
      });
    },
    [locationToIndex]
  );

  const handleEnd = useCallback((_evt?: GestureResponderEvent, _gestureState?: any) => {
    if (path.length === 0) return;
    const word = path.map((i) => letters[i] ?? "").join("");
    onWordComplete(word, path);
    setPath([]);
  }, [letters, onWordComplete, path]);

  const currentWord = useMemo(
    () => path.map((i) => letters[i] ?? "").join(""),
    [letters, path]
  );

  const lines = useMemo(() => {
    if (!cellSize || path.length < 2) return [];
    const segments = [];
    for (let i = 0; i < path.length - 1; i++) {
      const start = getCellCenter(path[i]);
      const end = getCellCenter(path[i + 1]);
      const dx = end.x - start.x;
      const dy = end.y - start.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const angle = Math.atan2(dy, dx);
      const midX = start.x + dx / 2;
      const midY = start.y + dy / 2;

      segments.push({
        key: `${path[i]}-${path[i + 1]}-${i}`,
        left: midX - distance / 2,
        top: midY - LINE_THICKNESS / 2,
        width: distance,
        angle,
      });
    }
    return segments;
  }, [cellSize, getCellCenter, path]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Game #{id}</Text>
          {username ? (
            <Text style={styles.subtitle}>Player: {username}</Text>
          ) : (
            <Text style={styles.subtitle}>Player joined</Text>
          )}
        </View>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backButtonText}>Lobby</Text>
        </Pressable>
      </View>

      {error && <Text style={styles.error}>{error}</Text>}
      {loading && <ActivityIndicator color="#22d3ee" />}

      <View
        ref={gridRef}
        style={styles.gridWrapper}
        onLayout={measureGrid}
        onStartShouldSetResponder={() => true}
        onResponderGrant={handleStart}
        onResponderMove={handleMove}
        onResponderRelease={handleEnd}
        onResponderTerminate={handleEnd}
      >
        {letters.map((letter, idx) => {
          const isActive = path.includes(idx);
          return (
            <View
              key={idx}
              style={[styles.cell, isActive && styles.cellActive]}
            >
              <Text style={styles.cellText}>{letter}</Text>
            </View>
          );
        })}
        {!!lines.length && (
          <View pointerEvents="none" style={StyleSheet.absoluteFill}>
            {lines.map((line) => (
              <View
                key={line.key}
                style={[
                  styles.line,
                  {
                    left: line.left,
                    top: line.top,
                    width: line.width,
                    transform: [{ rotate: `${line.angle}rad` }],
                  },
                ]}
              />
            ))}
          </View>
        )}
      </View>

      <View style={styles.wordBar}>
        <Text style={styles.wordLabel}>Current word:</Text>
        <Text style={styles.wordValue}>{currentWord || "—"}</Text>
      </View>

      <Text style={styles.helper}>
        Drag across letters to trace a word. Release to finalize and submit.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0f172a",
    paddingHorizontal: 20,
    paddingTop: 60,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  title: {
    color: "#f5f5f5",
    fontSize: 28,
    fontWeight: "700",
    marginBottom: 4,
  },
  subtitle: {
    color: "#cbd5e1",
    fontSize: 16,
  },
  error: {
    color: "#f87171",
    marginBottom: 12,
  },
  gridWrapper: {
    marginTop: 12,
    width: "100%",
    aspectRatio: 1,
    flexDirection: "row",
    flexWrap: "wrap",
    position: "relative",
    borderRadius: 18,
    overflow: "hidden",
    backgroundColor: "#111827",
    borderWidth: 1,
    borderColor: "#1f2937",
  },
  cell: {
    width: "25%",
    height: "25%",  // Explicitly set height instead of using aspectRatio
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 0.5,
    borderColor: "#1f2937",
  },
  cellActive: {
    backgroundColor: "#22d3ee33",
  },
  cellText: {
    color: "#f5f5f5",
    fontSize: 24,
    fontWeight: "700",
  },
  line: {
    position: "absolute",
    height: 4,
    backgroundColor: "#22d3ee",
    borderRadius: 999,
    zIndex: 2,
  },
  wordBar: {
    marginTop: 20,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: "#1f2937",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#334155",
  },
  wordLabel: {
    color: "#cbd5e1",
    marginBottom: 6,
  },
  wordValue: {
    color: "#f8fafc",
    fontSize: 18,
    fontWeight: "700",
  },
  helper: {
    color: "#cbd5e1",
    marginTop: 16,
    lineHeight: 22,
  },
  backButton: {
    backgroundColor: "#22d3ee",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
  },
  backButtonText: {
    color: "#0f172a",
    fontWeight: "700",
  },
});
