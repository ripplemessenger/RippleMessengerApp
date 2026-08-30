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
                    <View className="flex-row items-center justify-center mb-1">
                        <Text className="text-lg font-semibold text-text-primary flex-1 text-center">
                            {title}
                        </Text>
                        <TouchableOpacity
                            onPress={onClose}
                            className="p-1 -mr-1"
                        >
                            <View className="w-8 h-8 rounded-full bg-secondary-light/50 items-center justify-center">
                                <Text className="text-base text-text-secondary">
                                    ✕
                                </Text>
                            </View>
                        </TouchableOpacity>
                    </View>
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
