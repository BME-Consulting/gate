// ==========================================
// Dialog コンポーネント
// ==========================================

import React from "react";
import {
  Modal,
  View,
  Text,
  StyleSheet,
  type ViewStyle,
} from "react-native";
import { tokens } from "../theme/tokens";
import { Button } from "./Button";

export interface DialogAction {
  label: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "danger" | "ghost";
}

export interface DialogProps {
  visible: boolean;
  title?: string;
  message: string;
  onClose?: () => void;
  onConfirm?: () => void;
  confirmText?: string;
  cancelText?: string;
  variant?: "info" | "warn" | "danger" | "success";
  style?: ViewStyle;
  actions?: DialogAction[]; // カスタムアクション配列
}

export function Dialog({
  visible,
  title,
  message,
  onClose,
  onConfirm,
  confirmText = "OK",
  cancelText = "キャンセル",
  variant = "info",
  style,
  actions,
}: DialogProps) {
  const hasCustomActions = actions !== undefined && actions.length > 0;
  const hasConfirm = onConfirm !== undefined;

  const handleRequestClose = () => {
    if (onClose) {
      onClose();
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleRequestClose}
    >
      <View style={styles.overlay}>
        <View style={[styles.dialog, style]}>
          {/* ヘッダー */}
          {title && (
            <View style={[styles.header, styles[`header_${variant}`]]}>
              <Text style={styles.title}>{title}</Text>
            </View>
          )}

          {/* メッセージ */}
          <View style={styles.body}>
            <Text style={styles.message}>{message}</Text>
          </View>

          {/* アクション */}
          <View style={styles.actions}>
            {hasCustomActions ? (
              // カスタムアクション
              <>
                {actions.map((action, index) => (
                  <Button
                    key={index}
                    title={action.label}
                    variant={action.variant || "primary"}
                    onPress={action.onPress}
                    style={styles.actionButton}
                  />
                ))}
              </>
            ) : hasConfirm ? (
              // 従来のonConfirm API
              <>
                <Button
                  title={cancelText}
                  variant="ghost"
                  onPress={onClose!}
                  style={styles.actionButton}
                />
                <Button
                  title={confirmText}
                  variant={variant === "danger" ? "danger" : "primary"}
                  onPress={() => {
                    onConfirm();
                    onClose?.();
                  }}
                  style={styles.actionButton}
                />
              </>
            ) : (
              // 単一のOKボタン
              <Button
                title={confirmText}
                variant="primary"
                onPress={onClose || (() => {})}
                fullWidth
              />
            )}
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
    padding: tokens.spacing.lg,
  },

  dialog: {
    backgroundColor: tokens.color.background.default,
    borderRadius: tokens.radius.lg,
    width: "100%",
    maxWidth: 400,
    ...tokens.shadow.lg,
  },

  header: {
    paddingHorizontal: tokens.spacing.xl,
    paddingTop: tokens.spacing.xl,
    paddingBottom: tokens.spacing.md,
    borderTopLeftRadius: tokens.radius.lg,
    borderTopRightRadius: tokens.radius.lg,
  },

  header_info: {
    backgroundColor: tokens.color.primary + "10",
  },
  header_warn: {
    backgroundColor: tokens.color.warn + "10",
  },
  header_danger: {
    backgroundColor: tokens.color.danger + "10",
  },
  header_success: {
    backgroundColor: tokens.color.success + "10",
  },

  title: {
    fontSize: tokens.font.size.lg,
    fontWeight: tokens.font.weight.bold,
    color: tokens.color.text.primary,
  },

  body: {
    paddingHorizontal: tokens.spacing.xl,
    paddingVertical: tokens.spacing.lg,
  },

  message: {
    fontSize: tokens.font.size.base,
    color: tokens.color.text.primary,
    lineHeight: 24,
  },

  actions: {
    flexDirection: "row",
    gap: tokens.spacing.md,
    padding: tokens.spacing.lg,
    paddingTop: 0,
  },

  actionButton: {
    flex: 1,
  },
});
