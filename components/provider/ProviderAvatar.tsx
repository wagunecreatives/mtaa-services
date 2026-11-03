import { Image } from "expo-image";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Colors } from "../../constants/Colors";

const TINTS = [
  { bg: Colors.primarySoft, fg: Colors.primary },
  { bg: Colors.accentSoft, fg: Colors.accentText },
  { bg: Colors.successSoft, fg: Colors.successText },
] as const;

function tintFor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return TINTS[hash % TINTS.length];
}

function initialsOf(name: string) {
  const letters = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join("");
  return letters || "?";
}

type Props = {
  name: string;
  photoUrl?: string | null;
  size?: number;
};

/** Real photo when available; coloured initials when missing or when the image fails to load. */
export function ProviderAvatar({ name, photoUrl, size = 56 }: Props) {
  // Remember which URL failed, so a new photoUrl gets a fresh attempt automatically.
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const failed = failedUrl === photoUrl;

  const box = { width: size, height: size, borderRadius: size / 2 };

  if (photoUrl && !failed) {
    return (
      <Image
        source={{ uri: photoUrl }}
        style={[styles.photo, box]}
        contentFit="cover"
        transition={150}
        onError={() => setFailedUrl(photoUrl ?? null)}
        accessibilityLabel={`${name} photo`}
      />
    );
  }

  const tint = tintFor(name);
  return (
    <View style={[styles.fallback, box, { backgroundColor: tint.bg }]} accessibilityLabel={`${name} avatar`}>
      <Text style={[styles.initials, { color: tint.fg, fontSize: size * 0.36 }]}>{initialsOf(name)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  photo: { backgroundColor: Colors.backgroundTertiary },
  fallback: { alignItems: "center", justifyContent: "center" },
  initials: { fontWeight: "800" },
});