import { router } from "expo-router";
import { TouchableOpacity, Text, StyleSheet } from "react-native";
import { Colors } from "../../constants/Colors";
import { RouteMessage, RouteScaffold } from "../../components/RouteScaffold";
import { useAuth } from "../../contexts/AuthContext";

export default function CustomerProfileScreen() {
  const { profile, user, signOut } = useAuth();
  const logout = async () => {
    const { error } = await signOut();
    if (!error) router.replace("/(auth)/welcome");
  };
  return (
    <RouteScaffold eyebrow="Customer" title="Your profile" description="Your account information.">
      <RouteMessage>Name: {profile?.full_name || "Not set"}{"\n"}Email: {user?.email || "Not available"}{"\n"}Phone: {profile?.phone || "Not set"}</RouteMessage>
      <TouchableOpacity style={styles.link} onPress={() => router.push("/blocked-users" as never)}><Text style={styles.linkText}>Blocked accounts</Text></TouchableOpacity>
      <TouchableOpacity style={styles.button} onPress={logout}><Text style={styles.buttonText}>Sign out</Text></TouchableOpacity>
    </RouteScaffold>
  );
}

const styles = StyleSheet.create({ link: { minHeight: 48, justifyContent: "center" }, linkText: { color: Colors.primary, fontWeight: "800" }, button: { minHeight: 52, alignItems: "center", justifyContent: "center", borderRadius: 14, backgroundColor: Colors.primary }, buttonText: { color: Colors.textInverse, fontSize: 16, fontWeight: "700" } });
