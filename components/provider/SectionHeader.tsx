import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { Colors } from "../../constants/Colors";

type Props = {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
};

export function SectionHeader({ title, actionLabel, onAction }: Props) {
  return (
    <View style={styles.row}>
      <Text style={styles.title} accessibilityRole="header">{title}</Text>
      {actionLabel && onAction ? (
        <TouchableOpacity onPress={onAction} accessibilityRole="button" hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={styles.action}>{actionLabel}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 8 },
  title: { color: Colors.text, fontSize: 19, fontWeight: "800" },
  action: { color: Colors.primary, fontSize: 14, fontWeight: "700" },
});