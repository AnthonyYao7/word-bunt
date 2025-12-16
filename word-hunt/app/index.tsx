import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";

type JoinableGame = {
  game_id: number;
  host: string;
};

const API_BASE =
  process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, "") || "http://localhost:8000";

export default function Index() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [games, setGames] = useState<JoinableGame[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionTarget, setActionTarget] = useState<"create" | number | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);

  const trimmedUsername = useMemo(() => username.trim(), [username]);
  const canSubmit = trimmedUsername.length > 0;

  useEffect(() => {
    fetchOpenGames();
  }, []);

  const fetchOpenGames = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/open_games`);
      if (!res.ok) {
        throw new Error(`Failed to load games (${res.status})`);
      }
      const body = (await res.json()) as JoinableGame[];
      setGames(body);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to load available games."
      );
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!canSubmit) {
      setError("Enter a username before creating a game.");
      return;
    }
    setActionTarget("create");
    setError(null);
    try {
      const res = await fetch(
        `${API_BASE}/create_game?username=${encodeURIComponent(
          trimmedUsername
        )}`
      );
      if (!res.ok) {
        throw new Error(`Create failed (${res.status})`);
      }
      const gameId = (await res.json()) as number;
      router.push(`/game/${gameId}?username=${encodeURIComponent(trimmedUsername)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create a game.");
    } finally {
      setActionTarget(null);
    }
  };

  const handleJoin = async (gameId: number) => {
    if (!canSubmit) {
      setError("Enter a username before joining a game.");
      return;
    }
    setActionTarget(gameId);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/join_game?game_id=${gameId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: trimmedUsername }),
      });
      if (!res.ok) {
        const detail = await res.text();
        throw new Error(`Join failed (${res.status}): ${detail}`);
      }
      router.push(`/game/${gameId}?username=${encodeURIComponent(trimmedUsername)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not join the game.");
    } finally {
      setActionTarget(null);
    }
  };

  const renderGame = ({ item }: { item: JoinableGame }) => {
    const busy = actionTarget === item.game_id;
    return (
      <View style={styles.gameRow}>
        <View>
          <Text style={styles.gameTitle}>Game #{item.game_id}</Text>
          <Text style={styles.gameMeta}>Host: {item.host}</Text>
        </View>
        <Pressable
          onPress={() => handleJoin(item.game_id)}
          style={({ pressed }) => [
            styles.joinButton,
            pressed && styles.joinButtonPressed,
            busy && styles.buttonDisabled,
          ]}
          disabled={busy}
        >
          <Text style={styles.joinButtonText}>
            {busy ? "Joining..." : "Join"}
          </Text>
        </Pressable>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Word Hunt</Text>
      <Text style={styles.subtitle}>
        Create a game or join one that's waiting for a player.
      </Text>

      <TextInput
        placeholder="Your username"
        placeholderTextColor="#9aa0a6"
        value={username}
        onChangeText={setUsername}
        style={styles.input}
        autoCapitalize="none"
      />

      <Pressable
        onPress={handleCreate}
        disabled={actionTarget === "create"}
        style={({ pressed }) => [
          styles.primaryButton,
          pressed && styles.primaryButtonPressed,
          actionTarget === "create" && styles.buttonDisabled,
        ]}
      >
        <Text style={styles.primaryButtonText}>
          {actionTarget === "create" ? "Creating..." : "Create Game"}
        </Text>
      </Pressable>

      <View style={styles.listHeader}>
        <Text style={styles.sectionTitle}>Games waiting for players</Text>
        <Pressable onPress={fetchOpenGames}>
          <Text style={styles.refresh}>Refresh</Text>
        </Pressable>
      </View>

      {error && <Text style={styles.error}>{error}</Text>}

      {loading ? (
        <ActivityIndicator color="#f5f5f5" />
      ) : games.length === 0 ? (
        <Text style={styles.emptyState}>No open games right now.</Text>
      ) : (
        <FlatList
          data={games}
          keyExtractor={(item) => item.game_id.toString()}
          renderItem={renderGame}
          contentContainerStyle={styles.list}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0f172a",
    paddingHorizontal: 20,
    paddingTop: 70,
  },
  title: {
    color: "#f5f5f5",
    fontSize: 28,
    fontWeight: "700",
    marginBottom: 6,
  },
  subtitle: {
    color: "#cbd5e1",
    fontSize: 16,
    marginBottom: 20,
  },
  input: {
    width: "100%",
    backgroundColor: "#1f2937",
    color: "#f5f5f5",
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#334155",
    marginBottom: 16,
  },
  primaryButton: {
    width: "100%",
    backgroundColor: "#14b8a6",
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
    marginBottom: 22,
  },
  primaryButtonPressed: {
    backgroundColor: "#0d9488",
  },
  primaryButtonText: {
    color: "#0f172a",
    fontSize: 16,
    fontWeight: "700",
  },
  listHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  sectionTitle: {
    color: "#e2e8f0",
    fontSize: 16,
    fontWeight: "600",
  },
  refresh: {
    color: "#22d3ee",
    fontWeight: "600",
  },
  list: {
    gap: 12,
    paddingBottom: 24,
  },
  gameRow: {
    backgroundColor: "#1f2937",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "#334155",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  gameTitle: {
    color: "#f8fafc",
    fontSize: 16,
    fontWeight: "700",
  },
  gameMeta: {
    color: "#cbd5e1",
    marginTop: 4,
  },
  joinButton: {
    backgroundColor: "#22d3ee",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
  },
  joinButtonPressed: {
    backgroundColor: "#0ea5e9",
  },
  joinButtonText: {
    color: "#0b132b",
    fontWeight: "700",
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  error: {
    color: "#f87171",
    marginBottom: 8,
  },
  emptyState: {
    color: "#94a3b8",
    paddingVertical: 12,
  },
});
