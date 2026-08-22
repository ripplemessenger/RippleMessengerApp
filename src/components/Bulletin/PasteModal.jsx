import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useDispatch, useSelector } from 'react-redux';

import { PasteBulletin } from '../../store/sagas/messenger.actions';
import { setPasteFlag } from '../../store/slices/MessengerSlice';

const MAX_JSON_LENGTH = 65536; /* 64KB — generous upper bound for a single bulletin */

/**
 * PasteModal — bottom-sheet modal for importing raw JSON bulletins.
 *
 * Flow:
 *   1. User taps "Paste Bulletin" button (FAB or menu)
 *   2. Modal opens with empty TextInput
 *   3. User pastes a raw bulletin JSON string
 *   4. On submit: validates schema + signature via PasteBulletin saga
 *   5. On success: bulletin cached to local SQLite, flash notice shown
 *   6. Modal closes after submission
 */
export default function PasteModal({ visible }) {
  const dispatch = useDispatch();
  const contentRef = useRef(null);

  const [jsonText, setJsonText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Reset form when modal opens
  useEffect(() => {
    if (visible) {
      setJsonText('');
      setIsSubmitting(false);
      setTimeout(() => contentRef.current?.focus(), 400);
    }
  }, [visible]);

  const handleClose = useCallback(() => {
    dispatch(setPasteFlag(false));
  }, [dispatch]);

  const handleSubmit = useCallback(() => {
    const trimmed = jsonText.trim();
    if (!trimmed) {
      return;
    }
    setIsSubmitting(true);
    dispatch(PasteBulletin({ json_str: trimmed }));
    // Close modal after dispatch — saga handles success/error via flash notice
    setTimeout(() => {
      dispatch(setPasteFlag(false));
      setIsSubmitting(false);
    }, 300);
  }, [jsonText, dispatch]);

  const canSubmit = jsonText.trim().length > 0 && !isSubmitting;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
    >
      <View className="flex-1 bg-black/45 justify-end">
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          className="bg-white rounded-t-3xl max-h-[85%] pb-6"
        >
          {/* Drag indicator */}
          <View className="w-[40px] h-[5px] bg-gray-300 rounded-full self-center mt-3 mb-2" />

          {/* Header */}
          <View className="flex-row items-center justify-between px-5 pb-3 border-b border-[#f0e6c0]">
            <Text className="text-lg font-bold text-text-primary">
              Paste Bulletin
            </Text>
            <TouchableOpacity onPress={handleClose} hitSlop={10}>
              <Ionicons name="close" size={24} color="#999" />
            </TouchableOpacity>
          </View>

          {/* Body */}
          <View className="px-5 pt-4">
            <Text className="text-sm text-text-secondary mb-2">
              Paste a raw bulletin JSON below. Schema and signature will be validated automatically.
            </Text>

            {/* JSON textarea */}
            <TextInput
              ref={contentRef}
              multiline
              numberOfLines={12}
              placeholder='{"ObjectType": 1, "Sequence": ..., ...}'
              placeholderTextColor="#bbb"
              value={jsonText}
              onChangeText={setJsonText}
              maxLength={MAX_JSON_LENGTH}
              className="min-h-[160px] max-h-[280px] px-3 py-2 border border-[#e6d8a8] rounded-lg text-sm font-mono bg-white"
            />

            {/* Character count */}
            <View className="flex-row justify-between mt-1">
              <Text className="text-xs text-text-secondary/50">
                Max {MAX_JSON_LENGTH.toLocaleString()} characters
              </Text>
              <Text className={`text-xs ${
                jsonText.length > 0 ? 'text-text-secondary/70' : 'text-transparent'
              }`}>
                {jsonText.length.toLocaleString()} chars
              </Text>
            </View>

            {/* Info section */}
            <View className="mt-3 px-2 py-2 bg-[#fdf9e8] rounded-lg border border-[#f0e6c0]">
              <View className="flex-row items-start gap-2">
                <Ionicons name="information-circle" size={16} color="#a89f85" style={{ marginTop: 2 }} />
                <Text className="text-xs text-text-secondary flex-1">
                  The bulletin must contain valid ObjectType, Sequence, PublicKey, Signature, and other required fields. Invalid or tampered bulletins are rejected.
                </Text>
              </View>
            </View>
          </View>

          {/* Footer */}
          <View className="flex-row justify-center pt-4 mt-3 border-t border-[#f0e6c0] gap-3 px-5">
            <TouchableOpacity
              onPress={handleClose}
              className="flex-1 py-3 rounded-xl border border-secondary-light items-center"
              activeOpacity={0.7}
            >
              <Text className="text-base font-medium text-text-secondary">
                Cancel
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleSubmit}
              disabled={!canSubmit}
              activeOpacity={0.7}
              className={`flex-1 py-3 rounded-xl items-center ${
                canSubmit ? 'bg-primary' : 'bg-gray-200'
              }`}
            >
              <Text className={`text-base font-semibold ${
                canSubmit ? 'text-text-primary' : 'text-gray-400'
              }`}>
                {isSubmitting ? 'Importing...' : 'Import'}
              </Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}
