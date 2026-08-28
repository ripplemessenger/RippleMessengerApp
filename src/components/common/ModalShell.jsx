import React from "react";
import { Modal, View, Text, TouchableOpacity } from "react-native";

/**
 * ModalShell — unified centered modal shell.
 *
 * Before this component, every modal (tag search, add contact, edit nickname,
 * temp login, add server, ...) hand-rolled the same backdrop + card + title.
 *
 * Props:
 *   visible, onClose, title, children
 *   bottom  - when true, anchors the card to the bottom (keyboard-friendly)
 *   bottomPadding - extra bottom padding (e.g. keyboard height)
 */
export default function ModalShell({
    visible,
    onClose,
    title,
    children,
    bottom = false,
    bottomPadding = 0,
}) {
    return (
        <Modal
            visible={visible}
            transparent
            animationType="fade"
            onRequestClose={onClose}
        >
            <TouchableOpacity
                className={`flex-1 bg-black/50 px-6 ${
                    bottom ? "justify-end" : "justify-center items-center"
                }`}
                style={
                    bottom ? { paddingBottom: bottomPadding + 24 } : undefined
                }
                activeOpacity={1}
                onPress={onClose}
            >
                <TouchableOpacity
                    className="bg-surface-card rounded-2xl p-5 w-full gap-4 border border-secondary-light"
                    activeOpacity={1}
                    onPress={() => {}}
                >
                    {title ? (
                        <Text className="text-lg font-semibold text-text-primary text-center">
                            {title}
                        </Text>
                    ) : null}
                    {children}
                </TouchableOpacity>
            </TouchableOpacity>
        </Modal>
    );
}
