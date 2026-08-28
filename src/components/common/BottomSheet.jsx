import React from "react";
import { Modal, View, Text, TouchableOpacity } from "react-native";

/**
 * BottomSheet — unified bottom sheet shell (slide-up panel).
 *
 * Used by SettingScreen (sound/language pickers) and the management tabs
 * (JSON preview, tag picker). Replaces 4 hand-rolled copies.
 *
 * Props:
 *   visible, onClose, title, subtitle?, children
 */
export default function BottomSheet({
    visible,
    onClose,
    title,
    subtitle,
    children,
}) {
    return (
        <Modal
            visible={visible}
            transparent
            animationType="slide"
            onRequestClose={onClose}
        >
            <TouchableOpacity
                className="flex-1 justify-end bg-black/50"
                activeOpacity={1}
                onPress={onClose}
            >
                <TouchableOpacity
                    className="bg-surface-card rounded-t-3xl p-5 pb-8 border-t border-secondary-light"
                    activeOpacity={1}
                    onPress={() => {}}
                >
                    <View className="w-10 h-1 bg-secondary-light rounded-full mx-auto mb-4" />
                    <Text className="text-lg font-semibold text-text-primary text-center mb-1">
                        {title}
                    </Text>
                    {subtitle ? (
                        <Text className="text-sm text-text-secondary text-center mb-4">
                            {subtitle}
                        </Text>
                    ) : (
                        <View className="mb-3" />
                    )}
                    {children}
                </TouchableOpacity>
            </TouchableOpacity>
        </Modal>
    );
}
