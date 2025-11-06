// ==========================================
// パスコードモーダル
// ==========================================

import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  Platform,
} from "react-native";
import { Button, tokens } from "@mc-gate/ui-kit";

interface PasscodeModalProps {
  visible: boolean;
  mode: "set" | "verify";
  onSuccess: (passcode?: string) => void;
  onCancel: () => void;
  currentPasscode?: string;
}

export function PasscodeModal({
  visible,
  mode,
  onSuccess,
  onCancel,
  currentPasscode,
}: PasscodeModalProps) {
  const [passcode, setPasscode] = useState("");
  const [confirmPasscode, setConfirmPasscode] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!visible) {
      // モーダルが閉じられたらリセット
      setPasscode("");
      setConfirmPasscode("");
      setError("");
    }
  }, [visible]);

  const handleSubmit = () => {
    setError("");

    if (mode === "set") {
      // 設定モード
      if (passcode.length < 4) {
        setError("パスコードは4桁以上で設定してください");
        return;
      }

      if (passcode !== confirmPasscode) {
        setError("パスコードが一致しません");
        return;
      }

      onSuccess(passcode); // 設定したパスコードを返す
    } else {
      // 認証モード
      if (passcode !== currentPasscode) {
        setError("パスコードが正しくありません");
        setPasscode("");
        return;
      }

      onSuccess(); // 認証成功
    }
  };

  const handleKeyPress = (key: string) => {
    if (key === "backspace") {
      if (mode === "set" && confirmPasscode) {
        setConfirmPasscode(confirmPasscode.slice(0, -1));
      } else {
        setPasscode(passcode.slice(0, -1));
      }
    } else if (key.match(/^\d$/)) {
      if (mode === "set") {
        if (passcode.length < 6 && !confirmPasscode) {
          setPasscode(passcode + key);
        } else if (confirmPasscode.length < 6) {
          setConfirmPasscode(confirmPasscode + key);
        }
      } else {
        if (passcode.length < 6) {
          setPasscode(passcode + key);
        }
      }
    }
  };

  const renderKeypad = () => {
    const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "backspace"];

    return (
      <View style={styles.keypad}>
        {keys.map((key, index) => {
          if (key === "") {
            return <View key={index} style={styles.keyEmpty} />;
          }

          return (
            <TouchableOpacity
              key={key}
              style={styles.key}
              onPress={() => handleKeyPress(key)}
            >
              <Text style={styles.keyText}>
                {key === "backspace" ? "⌫" : key}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    );
  };

  const renderDots = (value: string, maxLength: number = 6) => {
    return (
      <View style={styles.dotsContainer}>
        {Array.from({ length: maxLength }).map((_, index) => (
          <View
            key={index}
            style={[
              styles.dot,
              index < value.length && styles.dotFilled,
            ]}
          />
        ))}
      </View>
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onCancel}
    >
      <View style={styles.overlay}>
        <View style={styles.container}>
          <Text style={styles.title}>
            {mode === "set" ? "パスコードを設定" : "パスコードを入力"}
          </Text>

          {mode === "set" && !confirmPasscode ? (
            <>
              <Text style={styles.subtitle}>新しいパスコード（4～6桁）</Text>
              {renderDots(passcode)}
            </>
          ) : mode === "set" && confirmPasscode ? (
            <>
              <Text style={styles.subtitle}>パスコードを再入力</Text>
              {renderDots(confirmPasscode)}
            </>
          ) : (
            <>
              <Text style={styles.subtitle}>パスコードを入力してください</Text>
              {renderDots(passcode)}
            </>
          )}

          {error ? <Text style={styles.error}>{error}</Text> : null}

          {renderKeypad()}

          <View style={styles.actions}>
            <Button
              title="キャンセル"
              variant="secondary"
              onPress={onCancel}
              style={styles.button}
            />
            {mode === "set" && passcode.length >= 4 && !confirmPasscode ? (
              <Button
                title="次へ"
                variant="primary"
                onPress={() => {
                  setError("");
                  setConfirmPasscode(" "); // トリガーとして使用
                  setConfirmPasscode("");
                }}
                style={styles.button}
              />
            ) : mode === "set" && confirmPasscode.length >= 4 ? (
              <Button
                title="設定"
                variant="primary"
                onPress={handleSubmit}
                style={styles.button}
              />
            ) : mode === "verify" && passcode.length >= 4 ? (
              <Button
                title="確認"
                variant="primary"
                onPress={handleSubmit}
                style={styles.button}
              />
            ) : null}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
  },

  container: {
    width: "90%",
    maxWidth: 400,
    backgroundColor: tokens.color.background.default,
    borderRadius: tokens.radius.lg,
    padding: tokens.spacing.xl,
    ...tokens.shadow.lg,
  },

  title: {
    fontSize: tokens.font.size.h2,
    fontWeight: tokens.font.weight.bold,
    color: tokens.color.text.primary,
    textAlign: "center",
    marginBottom: tokens.spacing.md,
  },

  subtitle: {
    fontSize: tokens.font.size.base,
    color: tokens.color.text.secondary,
    textAlign: "center",
    marginBottom: tokens.spacing.lg,
  },

  dotsContainer: {
    flexDirection: "row",
    justifyContent: "center",
    gap: tokens.spacing.md,
    marginBottom: tokens.spacing.xl,
  },

  dot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: tokens.color.border.default,
    backgroundColor: tokens.color.background.default,
  },

  dotFilled: {
    backgroundColor: tokens.color.primary,
    borderColor: tokens.color.primary,
  },

  keypad: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: tokens.spacing.sm,
    marginBottom: tokens.spacing.lg,
  },

  key: {
    width: "30%",
    aspectRatio: 1.5,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: tokens.color.background.paper,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: tokens.color.border.default,
  },

  keyEmpty: {
    width: "30%",
    aspectRatio: 1.5,
  },

  keyText: {
    fontSize: tokens.font.size.h2,
    fontWeight: tokens.font.weight.semibold,
    color: tokens.color.text.primary,
  },

  error: {
    fontSize: tokens.font.size.sm,
    color: tokens.color.danger,
    textAlign: "center",
    marginBottom: tokens.spacing.md,
  },

  actions: {
    flexDirection: "row",
    gap: tokens.spacing.md,
  },

  button: {
    flex: 1,
  },
});
