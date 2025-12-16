import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  ActivityIndicator,
  ScrollView,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { wordScore } from "./utils/scoring";

type Player = {
  username: string;
};

type GameResponse = {
  board: string;
  words: string[];
  player1: Player;
  player2: Player;
  player1_score: number;
  player2_score: number;
  player1_done: boolean;
  player2_done: boolean;
  player1_found_words: string[];
  player2_found_words: string[];
};

const API_BASE =
  process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, "") || "http://localhost:8000";

export default function GameOverScreen() {
  const router = useRouter();
  const { id, username } = useLocalSearchParams<{ id: string; username?: string }>();
  const [game, setGame] = useState<GameResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<NodeJS.Timeout | null>(null);
  const inFlight = useRef(false);
  const [showAllWords, setShowAllWords] = useState(false);
  const [showBoard, setShowBoard] = useState(false);

  const fetchGame = useCallback(async () => {
    if (!id || inFlight.current) return;
    setLoading(true);
    inFlight.current = true;
    try {
      const res = await fetch(`${API_BASE}/game?game_id=${id}`);
      if (!res.ok) throw new Error(`Failed to load results (${res.status})`);
      const body = (await res.json()) as GameResponse;
      setGame(body);
      setError(null);
      if (body?.player1_done && body?.player2_done && pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load results.");
    } finally {
      setLoading(false);
      inFlight.current = false;
    }
  }, [API_BASE, id]);

  useEffect(() => {
    setLoading(true);
    fetchGame();
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(fetchGame, 2000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [fetchGame]);

  const playerSlot = useMemo(() => {
    if (!game || !username) return null;
    if (game.player1?.username === username) return "player1";
    if (game.player2?.username === username) return "player2";
    return null;
  }, [game, username]);

  const myWords =
    playerSlot === "player1"
      ? game?.player1_found_words ?? []
      : playerSlot === "player2"
      ? game?.player2_found_words ?? []
      : [];
  const opponentWords =
    playerSlot === "player1"
      ? game?.player2_found_words ?? []
      : playerSlot === "player2"
      ? game?.player1_found_words ?? []
      : [];

  const opponentName =
    playerSlot === "player1"
      ? game?.player2?.username || "Opponent"
      : playerSlot === "player2"
      ? game?.player1?.username || "Opponent"
      : "Opponent";

  const myScore =
    playerSlot === "player1"
      ? game?.player1_score ?? 0
      : playerSlot === "player2"
      ? game?.player2_score ?? 0
      : 0;
  const opponentScore =
    playerSlot === "player1"
      ? game?.player2_score ?? 0
      : playerSlot === "player2"
      ? game?.player1_score ?? 0
      : 0;

  const bothDone = Boolean(game?.player1_done && game?.player2_done);

  const myEntries = useMemo(() => {
    const entries = myWords.map((w) => ({ word: w, points: wordScore(w.length) }));
    entries.sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      return a.word.localeCompare(b.word);
    });
    return entries;
  }, [myWords]);
  const opponentEntries = useMemo(() => {
    const entries = opponentWords.map((w) => ({
      word: w,
      points: wordScore(w.length),
    }));
    entries.sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      return a.word.localeCompare(b.word);
    });
    return entries;
  }, [opponentWords]);

  const renderWord = ({ item }: { item: { word: string; points: number } }) => (
    <View style={styles.wordRow}>
      <Text style={styles.word}>{item.word.toUpperCase()}</Text>
      <Text style={styles.points}>+{item.points}</Text>
    </View>
  );

  const boardLetters = useMemo(() => {
    if (!game?.board || game.board.length < 16) return Array(16).fill("");
    return game.board.slice(0, 16).split("");
  }, [game?.board]);

  const allWords = useMemo(() => {
    const list = (game?.words ?? []).map((w) => ({
      word: w,
      points: wordScore(w.length),
    }));
    list.sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      return a.word.localeCompare(b.word);
    });
    return list;
  }, [game?.words]);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      <View>
        <Text style={styles.title}>Game Over</Text>
        <Text style={styles.subtitle}>Game #{id}</Text>
      </View>

      {error && <Text style={styles.error}>{error}</Text>}
      {loading && <ActivityIndicator color="#22d3ee" />}

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>
            {username ? `${username}'s words` : "Your words"}
          </Text>
          <Text style={styles.sectionScore}>{myScore} pts</Text>
        </View>
        {myEntries.length === 0 ? (
          <Text style={styles.empty}>No words submitted.</Text>
        ) : (
          <FlatList
            data={myEntries}
            renderItem={renderWord}
            keyExtractor={(item, index) => `${item.word}-${index}`}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
            scrollEnabled={false}
          />
        )}
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{opponentName}'s words</Text>
          <Text style={styles.sectionScore}>{opponentScore} pts</Text>
        </View>
        {!game?.player1_done || !game?.player2_done ? (
          <Text style={styles.waiting}>Waiting for the other player...</Text>
        ) : opponentEntries.length === 0 ? (
          <Text style={styles.empty}>No words submitted.</Text>
        ) : (
          <FlatList
            data={opponentEntries}
            renderItem={renderWord}
            keyExtractor={(item, index) => `${item.word}-${index}`}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
            scrollEnabled={false}
          />
        )}
      </View>

      <View style={styles.section}>
        <Pressable
          onPress={() => setShowAllWords((v) => !v)}
          style={styles.toggleButton}
        >
          <Text style={styles.sectionTitle}>
            {showAllWords ? "Hide" : "Show"} all possible words ({allWords.length})
          </Text>
        </Pressable>
        {showAllWords && (
          <View style={styles.allWordsWrapper}>
            <FlatList
              data={allWords}
              keyExtractor={(item, index) => `${item.word}-${index}`}
              renderItem={({ item }) => (
                <View style={styles.wordRow}>
                  <Text style={styles.word}>{item.word.toUpperCase()}</Text>
                  <Text style={styles.points}>+{item.points}</Text>
                </View>
              )}
              ItemSeparatorComponent={() => <View style={styles.separator} />}
              scrollEnabled={false}
            />
          </View>
        )}
      </View>

      <View style={styles.section}>
        <Pressable onPress={() => setShowBoard((v) => !v)} style={styles.toggleButton}>
          <Text style={styles.sectionTitle}>
            {showBoard ? "Hide" : "Show"} board
          </Text>
        </Pressable>
        {showBoard && (
          <View style={styles.boardGrid}>
            {boardLetters.map((ch, idx) => {
              const row = Math.floor(idx / 4);
              const col = idx % 4;
              return (
                <View
                  key={idx}
                  style={[
                    styles.boardCell,
                    {
                      left: `${col * 25}%`,
                      top: `${row * 25}%`,
                    },
                  ]}
                >
                  <Text style={styles.boardCellText}>{ch.toUpperCase()}</Text>
                </View>
              );
            })}
          </View>
        )}
      </View>

      {!bothDone && (
        <Text style={styles.helper}>
          The results will update automatically when both players finish.
        </Text>
      )}

      <View style={styles.actions}>
        <Pressable onPress={fetchGame} style={styles.secondaryButton}>
          <Text style={styles.secondaryText}>Refresh</Text>
        </Pressable>
        <Pressable onPress={() => router.replace("/")} style={styles.primaryButton}>
          <Text style={styles.primaryText}>Back to Lobby</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#e6f4ea",
    paddingHorizontal: 20,
    paddingTop: 70,
  },
  scrollContent: {
    paddingBottom: 40,
    gap: 12,
  },
  title: {
    color: "#0f172a",
    fontSize: 28,
    fontWeight: "800",
  },
  subtitle: {
    color: "#1f2937",
    fontSize: 16,
    marginBottom: 8,
  },
  error: {
    color: "#b91c1c",
  },
  section: {
    backgroundColor: "#d4ebda",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "#9ac3a5",
    marginBottom: 12,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  sectionTitle: {
    color: "#0f172a",
    fontSize: 16,
    fontWeight: "700",
  },
  sectionScore: {
    color: "#0f766e",
    fontWeight: "800",
  },
  empty: {
    color: "#4b5563",
    paddingVertical: 6,
  },
  waiting: {
    color: "#b45309",
    paddingVertical: 6,
    fontWeight: "700",
  },
  wordRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  word: {
    color: "#0f172a",
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  points: {
    color: "#15803d",
    fontWeight: "700",
  },
  separator: {
    height: 8,
  },
  helper: {
    color: "#1f2937",
    fontSize: 14,
  },
  toggleButton: {
    paddingVertical: 6,
  },
  allWordsWrapper: {
    marginTop: 8,
  },
  boardGrid: {
    marginTop: 12,
    width: "100%",
    aspectRatio: 1,
    position: "relative",
    backgroundColor: "#eaf6ef",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#9ac3a5",
    overflow: "hidden",
  },
  boardCell: {
    position: "absolute",
    width: "25%",
    height: "25%",
    alignItems: "center",
    justifyContent: "center",
  },
  boardCellText: {
    color: "#0f172a",
    fontWeight: "800",
    fontSize: 18,
  },
  actions: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 6,
  },
  secondaryButton: {
    flex: 1,
    borderColor: "#0f766e",
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
    marginRight: 6,
  },
  secondaryText: {
    color: "#0f766e",
    fontWeight: "700",
  },
  primaryButton: {
    flex: 1,
    backgroundColor: "#0f766e",
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
    marginLeft: 6,
  },
  primaryText: {
    color: "#e6f4ea",
    fontWeight: "800",
  },
});
