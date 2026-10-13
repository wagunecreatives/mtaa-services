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
      <TouchableOpacity style={styles.button} onPress={logout}><Text style={styles.buttonText}>Sign out</Text></TouchableOpacity>
    </RouteScaffold>
  );
}

const styles = StyleSheet.create({ button: { minHeight: 52, alignItems: "center", justifyContent: "center", borderRadius: 14, backgroundColor: Colors.primary }, buttonText: { color: Colors.textInverse, fontSize: 16, fontWeight: "700" } });
