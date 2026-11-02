import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Colors } from "../../constants/Colors";
import { useAuth } from "../../contexts/AuthContext";
import { supabase } from "../../lib/supabase";

type Audience = "customer" | "provider";

type MessageThread = {
  job_id: string;
  request_id: string;
  job_status: string;
  service_title: string;
  counterpart_id: string;
  counterpart_name: string;
  last_message: string | null;
  last_message_at: string | null;
  last_message_from_me: boolean | null;
  unread_count: number;
};

type ServiceMessage = {
  id: string;
  job_id: string;
  sender_id: string;
  body: string;
  created_at: string;
  read_at: string | null;
};

export function ServiceMessagesScreen({ audience }: { audience: Audience }) {
  const { user } = useAuth();
  const params = useLocalSearchParams<{ jobId?: string | string[] }>();
  const jobId = Array.isArray(params.jobId) ? params.jobId[0] : params.jobId;
  const route = audience === "provider" ? "/(provider)/messages" : "/(customer)/messages";
  const [threads, setThreads] = useState<MessageThread[]>([]);
  const [thread, setThread] = useState<MessageThread | null>(null);
  const [messages, setMessages] = useState<ServiceMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!user) {
      setLoading(false);
      setError("Sign in to view your service messages.");
      return;
    }

    setLoading(true);
    setError("");
    try {
      const { data: threadData, error: threadError } = await supabase.rpc(
        "get_service_message_threads",
        { p_job_id: jobId ?? null, p_limit: 100 },
      );
      if (threadError) throw threadError;

      const rows = (threadData ?? []) as MessageThread[];
      if (!jobId) {
        setThreads(rows);
        setThread(null);
        setMessages([]);
        return;
      }

      const selectedThread = rows[0];
      if (!selectedThread) {
        setThread(null);
        setMessages([]);
        setError("This service conversation is not available to your account.");
        return;
      }

      const { error: readError } = await supabase.rpc("mark_service_messages_read", {
        p_job_id: jobId,
      });
      if (readError) throw readError;

      const { data: messageData, error: messageError } = await supabase
        .from("service_messages")
        .select("id,job_id,sender_id,body,created_at,read_at")
        .eq("job_id", jobId)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(100);
      if (messageError) throw messageError;

      setThreads(rows.map((item) => item.job_id === jobId ? { ...item, unread_count: 0 } : item));
      setThread({ ...selectedThread, unread_count: 0 });
      setMessages((messageData ?? []) as ServiceMessage[]);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load messages. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [jobId, user]);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  useEffect(() => {
    if (!user) return;

    const notifications = supabase
      .channel(`message-inbox-notices:${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `recipient_id=eq.${user.id}` },
        () => void load(),
      )
      .subscribe();

    const conversation = jobId
      ? supabase
          .channel(`service-messages:${jobId}`)
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "service_messages", filter: `job_id=eq.${jobId}` },
            () => void load(),
          )
          .subscribe()
      : null;

    return () => {
      void supabase.removeChannel(notifications);
      if (conversation) void supabase.removeChannel(conversation);
    };
  }, [jobId, load, user]);

  const send = async () => {
    const body = draft.trim();
    if (!user || !jobId || !body || sending) return;
    if (body.length > 2000) {
      setError("Messages must be 2,000 characters or fewer.");
      return;
    }

    setSending(true);
    setError("");
    try {
      const { error: sendError } = await supabase.from("service_messages").insert({
        job_id: jobId,
        sender_id: user.id,
        body,
      });
      if (sendError) throw sendError;
      setDraft("");
      await load();
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "Could not send this message. Please try again.");
    } finally {
      setSending(false);
    }
  };

  const renderMessage = ({ item: message }: { item: ServiceMessage }) => {
    const ownMessage = message.sender_id === user?.id;
    return (
      <View style={[styles.bubble, ownMessage ? styles.ownBubble : styles.incomingBubble]}>
        <Text style={[styles.messageBody, ownMessage && styles.ownMessageBody]}>{message.body}</Text>
        <Text style={[styles.time, ownMessage && styles.ownTime]}>
          {new Date(message.created_at).toLocaleString()}
        </Text>
      </View>
    );
  };

  return (
    <View style={styles.screen}>
      <Text style={styles.eyebrow}>{audience === "provider" ? "Provider" : "Customer"}</Text>
      <Text style={styles.title}>{jobId ? "Conversation" : "Messages"}</Text>
      <Text style={styles.description}>
        {jobId
          ? "Keep service details and updates together in this private job conversation."
          : "Private conversations with customers and providers about your service jobs."}
      </Text>
      {jobId ? (
        <TouchableOpacity onPress={() => router.back()} accessibilityRole="button">
          <Text style={styles.back}>Back</Text>
        </TouchableOpacity>
      ) : null}
      {loading ? <ActivityIndicator color={Colors.primary} /> : null}
      {!!error ? <Text style={styles.error} accessibilityRole="alert">{error}</Text> : null}

      {jobId && thread?.job_id === jobId ? (
        <View style={styles.conversation}>
          <View style={styles.threadHeader}>
            <Text style={styles.counterpart}>{thread.counterpart_name}</Text>
            <Text style={styles.meta}>{thread.service_title} · {thread.job_status.replaceAll("_", " ")}</Text>
          </View>
          <FlatList
            style={styles.messageList}
            contentContainerStyle={styles.messageListContent}
            data={messages}
            keyExtractor={(message) => message.id}
            renderItem={renderMessage}
            inverted
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={!loading && !messages.length ? (
              <Text style={styles.emptyThread}>No messages yet. Send a note to start the conversation.</Text>
            ) : undefined}
          />
          <View style={styles.composer}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder="Write a message"
              placeholderTextColor={Colors.textLight}
              style={styles.input}
              multiline
              maxLength={2000}
              editable={!sending}
              accessibilityLabel="Message"
            />
            <TouchableOpacity
              onPress={() => void send()}
              disabled={sending || !draft.trim()}
              style={[styles.sendButton, (sending || !draft.trim()) && styles.disabledButton]}
              accessibilityRole="button"
              accessibilityLabel="Send message"
            >
              <Text style={styles.sendButtonText}>{sending ? "Sending…" : "Send"}</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

      {!jobId ? (
        <FlatList
          style={styles.inboxList}
          contentContainerStyle={styles.inboxContent}
          data={threads}
          keyExtractor={(item) => item.job_id}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.threadCard}
              onPress={() => router.push({ pathname: route as never, params: { jobId: item.job_id } })}
              accessibilityRole="button"
              accessibilityLabel={`Conversation with ${item.counterpart_name}${item.unread_count ? `, ${item.unread_count} unread messages` : ""}`}
            >
              <View style={styles.threadCopy}>
                <Text style={styles.counterpart}>{item.counterpart_name}</Text>
                <Text style={styles.meta}>{item.service_title} · {item.job_status.replaceAll("_", " ")}</Text>
                <Text style={styles.preview} numberOfLines={2}>
                  {item.last_message
                    ? `${item.last_message_from_me ? "You: " : ""}${item.last_message}`
                    : "No messages yet"}
                </Text>
              </View>
              <View style={styles.trailing}>
                {item.last_message_at ? (
                  <Text style={styles.time}>{new Date(item.last_message_at).toLocaleDateString()}</Text>
                ) : null}
                {item.unread_count > 0 ? (
                  <Text style={styles.unread}>{item.unread_count > 99 ? "99+" : item.unread_count}</Text>
                ) : null}
              </View>
            </TouchableOpacity>
          )}
          ListEmptyComponent={!loading && !error && !threads.length ? (
            <Text style={styles.emptyInbox}>
              No conversations yet. Open a service job to message the other participant.
            </Text>
          ) : undefined}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, gap: 12, padding: 20, paddingTop: 58, paddingBottom: 32, backgroundColor: Colors.background },
  eyebrow: { color: Colors.primary, fontSize: 12, fontWeight: "800", letterSpacing: 0.8, textTransform: "uppercase" },
  title: { color: Colors.text, fontSize: 28, fontWeight: "800" },
  description: { color: Colors.textSecondary, fontSize: 14, lineHeight: 21 },
  back: { color: Colors.primary, fontWeight: "800", paddingVertical: 4 },
  error: { color: Colors.error, lineHeight: 20 },
  emptyInbox: { padding: 16, borderRadius: 14, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.backgroundSecondary, color: Colors.textSecondary, lineHeight: 22 },
  inboxList: { flex: 1 },
  inboxContent: { flexGrow: 1, gap: 10, paddingBottom: 24 },
  threadCard: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 14, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.card },
  threadCopy: { flex: 1, gap: 4 },
  counterpart: { color: Colors.text, fontSize: 16, fontWeight: "800" },
  meta: { color: Colors.textSecondary, fontSize: 12, textTransform: "capitalize" },
  preview: { color: Colors.textSecondary, lineHeight: 19 },
  trailing: { alignItems: "flex-end", gap: 8 },
  unread: { minWidth: 22, overflow: "hidden", paddingHorizontal: 6, paddingVertical: 3, borderRadius: 12, backgroundColor: Colors.primary, color: Colors.textInverse, textAlign: "center", fontSize: 11, fontWeight: "800" },
  conversation: { flex: 1, gap: 10 },
  threadHeader: { gap: 4, padding: 14, borderRadius: 14, backgroundColor: Colors.backgroundSecondary },
  messageList: { flex: 1 },
  messageListContent: { flexGrow: 1, justifyContent: "flex-end", gap: 8, paddingVertical: 8 },
  emptyThread: { padding: 12, color: Colors.textSecondary, lineHeight: 20 },
  bubble: { maxWidth: "88%", gap: 5, padding: 12, borderRadius: 14 },
  ownBubble: { alignSelf: "flex-end", backgroundColor: Colors.primary },
  incomingBubble: { alignSelf: "flex-start", backgroundColor: Colors.backgroundTertiary },
  messageBody: { color: Colors.text, lineHeight: 20 },
  ownMessageBody: { color: Colors.textInverse },
  time: { color: Colors.textLight, fontSize: 11 },
  ownTime: { color: "#DCE7FF" },
  composer: { flexDirection: "row", alignItems: "flex-end", gap: 8 },
  input: { minHeight: 46, maxHeight: 120, flex: 1, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: Colors.border, borderRadius: 14, color: Colors.text, backgroundColor: Colors.backgroundSecondary },
  sendButton: { minHeight: 46, alignItems: "center", justifyContent: "center", paddingHorizontal: 16, borderRadius: 12, backgroundColor: Colors.primary },
  sendButtonText: { color: Colors.textInverse, fontWeight: "800" },
  disabledButton: { opacity: 0.55 },
});
