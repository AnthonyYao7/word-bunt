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
import { wordScore } from "../utils/scoring";

const GAME_DURATION = 90; // seconds

export default function GameScreen() {
  const router = useRouter();
  const { id, username } = useLocalSearchParams<{ id: string; username?: string }>();
  const [board, setBoard] = useState<string | null>(null);
  const [validWords, setValidWords] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gridSize, setGridSize] = useState(0);
  const [cellSize, setCellSize] = useState(0);
  const [path, setPath] = useState<number[]>([]);
  const [gridPosition, setGridPosition] = useState({ x: 0, y: 0 });
  const gridRef = useRef<View>(null);
  const [score, setScore] = useState(0);
  const [foundList, setFoundList] = useState<{ word: string; points: number }[]>([]);
  const [lastResult, setLastResult] = useState<{
    word: string;
    points: number;
    already?: boolean;
    valid: boolean;
  } | null>(null);
  const [foundWords, setFoundWords] = useState<Set<string>>(new Set());
  const [timeLeft, setTimeLeft] = useState(GAME_DURATION);
  const [ended, setEnded] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const LINE_THICKNESS = 4;
  const CELL_HITBOX_SCALE = 0.75; // Hitbox size for touch detection
  const CELL_VISUAL_SCALE = 0.95;  // Visual size of the tiles

  const API_BASE =
    process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, "") || "http://localhost:8000";

  const validWordSet = useMemo(
    () => new Set(validWords.map((w) => w.toLowerCase())),
    [validWords]
  );

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
        setValidWords(Array.isArray(body?.words) ? body.words : []);
        setFoundWords(new Set<string>());
        setScore(0);
        setLastResult(null);
        setFoundList([]);
        setTimeLeft(GAME_DURATION);
        setEnded(false);
        setSubmitted(false);
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
      
      // Check if touch is within the HITBOX (not visual) bounds
      const cellCenterX = col * cellSize + cellSize / 2;
      const cellCenterY = row * cellSize + cellSize / 2;
      const scaledCellSize = cellSize * CELL_HITBOX_SCALE;
      
      const distFromCenterX = Math.abs(relativeX - cellCenterX);
      const distFromCenterY = Math.abs(relativeY - cellCenterY);
      
      if (distFromCenterX > scaledCellSize / 2 || distFromCenterY > scaledCellSize / 2) {
        return -1; // Touch is in the gap between cells
      }
      
      return row * 4 + col;
    },
    [cellSize, gridSize, gridPosition]
  );

  const onWordComplete = useCallback(
    (word: string, _indices: number[]) => {
      if (ended || timeLeft <= 0) return;
      const normalized = word.toLowerCase();
      const isValid = normalized.length >= 3 && validWordSet.has(normalized);
      if (!isValid) {
        setLastResult({ word, points: 0, valid: false });
        return;
      }

      setFoundWords((current) => {
        const already = current.has(normalized);
        const next = new Set(current);
        if (!already) next.add(normalized);

        const pts = already ? 0 : wordScore(word.length);
        if (pts > 0) setScore((prev) => prev + pts);
        if (!already && pts > 0) {
          setFoundList((prev) => [...prev, { word: normalized, points: pts }]);
        }
        setLastResult({ word, points: pts, already, valid: true });

        return next;
      });
    },
    [ended, timeLeft, validWordSet]
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
      if (ended) return;
      measureGrid(); // Re-measure on touch to ensure accuracy
      const idx = locationToIndex(evt);
      if (idx === -1) return;
      setPath([idx]);
    },
    [ended, locationToIndex, measureGrid]
  );

  const handleMove = useCallback(
    (evt: GestureResponderEvent, _gestureState?: any) => {
      if (ended) return;
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
    [ended, locationToIndex]
  );

  const handleEnd = useCallback(
    (_evt?: GestureResponderEvent, _gestureState?: any) => {
      if (path.length === 0 || ended) return;
      const word = path.map((i) => letters[i] ?? "").join("");
      onWordComplete(word, path);
      setPath([]);
    },
    [ended, letters, onWordComplete, path]
  );

  const currentWord = useMemo(
    () => path.map((i) => letters[i] ?? "").join(""),
    [letters, path]
  );

  const timeDisplay = useMemo(() => {
    const minutes = Math.floor(timeLeft / 60);
    const seconds = timeLeft % 60;
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  }, [timeLeft]);

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

  useEffect(() => {
    if (!board) return;
    const start = Date.now();
    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - start) / 1000);
      const remaining = Math.max(GAME_DURATION - elapsed, 0);
      setTimeLeft(remaining);
      if (remaining === 0) {
        setEnded(true);
      }
    }, 250);

    return () => clearInterval(interval);
  }, [board]);

  useEffect(() => {
    if (ended) setPath([]);
  }, [ended]);

  const finalizeGame = useCallback(async () => {
    if (submitted || !id) return;
    setSubmitted(true);
    if (!username) {
      router.replace({
        pathname: "/game-over",
        params: { id },
      });
      return;
    }
    const payload = {
      username: username ?? "",
      words: foundList.map((w) => w.word),
    };
    try {
      await fetch(`${API_BASE}/submit_results?game_id=${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } catch (err) {
      console.warn("Failed to submit results", err);
    } finally {
      router.replace({
        pathname: "/game-over",
        params: { username, id },
      });
    }
  }, [API_BASE, foundList, id, router, submitted, username]);

  useEffect(() => {
    if (timeLeft <= 0 && !submitted) {
      setEnded(true);
      finalizeGame();
    }
  }, [finalizeGame, submitted, timeLeft]);

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
          <View style={styles.metaRow}>
            <Text style={styles.score}>Score: {score}</Text>
            <Text
              style={[
                styles.timer,
                timeLeft <= 10 && styles.timerDanger,
                ended && styles.timerEnded,
              ]}
            >
              {ended ? "Time's up" : `Time: ${timeDisplay}`}
            </Text>
          </View>
        </View>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backButtonText}>Lobby</Text>
        </Pressable>
      </View>

      {error && <Text style={styles.error}>{error}</Text>}
      {loading && <ActivityIndicator color="#22d3ee" />}

      <View
        style={[
          styles.resultBanner,
          lastResult?.valid ? styles.resultValid : styles.resultInvalid,
        ]}
      >
        <Text style={styles.resultText}>
          {lastResult
            ? lastResult.valid
              ? lastResult.already
                ? `${lastResult.word.toUpperCase()} was already found (+0)`
                : `Got ${lastResult.word.toUpperCase()} (+${lastResult.points} pts)`
              : `${lastResult.word.toUpperCase()} is not a valid word`
            : "Trace words to start scoring!"}
        </Text>
      </View>

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
          const row = Math.floor(idx / 4);
          const col = idx % 4;
          return (
            <View
              key={idx}
              style={[
                styles.cellContainer,
                {
                  left: `${col * 25}%`,
                  top: `${row * 25}%`,
                },
              ]}
            >
              <View style={[
                styles.cell,
                isActive && styles.cellActive,
                {
                  width: `${CELL_VISUAL_SCALE * 100}%`,
                  height: `${CELL_VISUAL_SCALE * 100}%`,
                }
              ]}>
                <Text style={styles.cellText}>{letter.toUpperCase()}</Text>
              </View>
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
        Drag across letters to trace a word. You have 90 seconds—when time is up
        we will submit your words automatically.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#e6f4ea",
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
    color: "#0f172a",
    fontSize: 28,
    fontWeight: "700",
    marginBottom: 4,
  },
  subtitle: {
    color: "#1f2937",
    fontSize: 16,
  },
  score: {
    color: "#0f172a",
    fontWeight: "700",
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    columnGap: 12,
    marginTop: 6,
  },
  timer: {
    color: "#0f172a",
    fontWeight: "700",
  },
  timerDanger: {
    color: "#b91c1c",
  },
  timerEnded: {
    color: "#b45309",
  },
  error: {
    color: "#b91c1c",
    marginBottom: 12,
  },
  resultBanner: {
    marginTop: 8,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  resultValid: {
    backgroundColor: "#bbf7d0",
    borderColor: "#22c55e",
  },
  resultInvalid: {
    backgroundColor: "#fee2e2",
    borderColor: "#ef4444",
  },
  resultText: {
    color: "#0f172a",
    fontWeight: "700",
    textAlign: "center",
  },
  gridWrapper: {
    marginTop: 12,
    width: "100%",
    aspectRatio: 1,
    position: "relative",
    borderRadius: 18,
    overflow: "hidden",
    backgroundColor: "#cfe9d8",
    borderWidth: 1,
    borderColor: "#9ac3a5",
  },
  cellContainer: {
    position: "absolute",
    width: "25%",
    height: "25%",
    alignItems: "center",
    justifyContent: "center",
  },
  cell: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    backgroundColor: "#eaf6ef",
    borderWidth: 1,
    borderColor: "#9ac3a5",
  },
  cellActive: {
    backgroundColor: "#bbf7d0",
    borderColor: "#16a34a",
  },
  cellText: {
    color: "#0f172a",
    fontSize: 28,
    fontWeight: "700",
  },
  line: {
    position: "absolute",
    height: 4,
    backgroundColor: "#0f766e",
    borderRadius: 999,
    zIndex: 2,
  },
  wordBar: {
    marginTop: 20,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: "#d4ebda",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#9ac3a5",
  },
  wordLabel: {
    color: "#1f2937",
    marginBottom: 6,
  },
  wordValue: {
    color: "#0f172a",
    fontSize: 18,
    fontWeight: "700",
  },
  helper: {
    color: "#1f2937",
    marginTop: 16,
    lineHeight: 22,
  },
  backButton: {
    backgroundColor: "#0f766e",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
  },
  backButtonText: {
    color: "#e6f4ea",
    fontWeight: "700",
  },
});
