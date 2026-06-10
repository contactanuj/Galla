import { View, Text, TextInput, type KeyboardTypeOptions } from 'react-native';

/**
 * A labelled text input defined at MODULE scope.
 *
 * IMPORTANT: never define an input-wrapping component inside another
 * component's render body — React would treat it as a new component type on
 * every keystroke, unmount/remount the TextInput, and the keyboard would
 * dismiss after a single character. Hoisting it here keeps focus stable.
 */
export default function FormField({
  label, value, onChangeText, keyboardType, multiline, placeholder,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  keyboardType?: KeyboardTypeOptions;
  multiline?: boolean;
  placeholder?: string;
}) {
  return (
    <View className="mb-3">
      <Text className="text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType ?? 'default'}
        multiline={multiline}
        placeholder={placeholder}
        autoCapitalize={keyboardType === 'email-address' ? 'none' : 'sentences'}
        className={`bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-900 dark:text-slate-50 ${multiline ? 'h-20' : ''}`}
      />
    </View>
  );
}
