import { Stack } from "expo-router";
import { RequestDraftProvider } from "../../contexts/RequestDraftContext";

export default function RequestLayout() {
  return (
    <RequestDraftProvider>
      <Stack screenOptions={{ headerShown: false }} />
    </RequestDraftProvider>
  );
}